import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/api/api_exception.dart';
import '../../core/api/api_providers.dart';
import '../../core/api/endpoints.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_typography.dart';

/// Snapshot of the batch upload-wardrobe job. [current]/[total] track the
/// photo being processed, [results] accumulate one processed item per photo,
/// and [phase] is `processing`, `done`, or `error`.
class UploadWardrobeJobState {
  const UploadWardrobeJobState({
    this.current = 0,
    this.total = 0,
    this.phase = 'processing',
    this.results = const [],
    this.error,
  });

  final int current;
  final int total;
  final String phase;
  final List<Map<String, dynamic>> results;
  final String? error;

  bool get isDone => phase == 'done';
  bool get isError => phase == 'error';
}

/// Drives the batch upload: for each picked photo it reads the file bytes,
/// downscales very large sources to ≤1024px (re-encoded as PNG), POSTs them
/// to `wardrobeUpload`, polls `wardrobeUploadProgress` every 800ms, and
/// collects the analyzed item. Unsupported/errored photos are skipped so the
/// remaining photos still process.
class UploadWardrobeJobNotifier extends AsyncNotifier<UploadWardrobeJobState> {
  static const _pollInterval = Duration(milliseconds: 800);
  static const _maxAttempts = 75;

  @override
  Future<UploadWardrobeJobState> build() async => const UploadWardrobeJobState();

  Future<void> startJob({required List<String> uris}) async {
    state = const AsyncValue.loading();
    try {
      final results = <Map<String, dynamic>>[];
      for (var i = 0; i < uris.length; i++) {
        _setState(
            UploadWardrobeJobState(current: i, total: uris.length, results: results));
        final uri = uris[i];
        final bytes = await _readFile(uri);
        final (encoded, mime) = await _prepare(bytes, uri);
        final sessionId = await _start(encoded, mime);
        if (sessionId == null) {
          _setState(UploadWardrobeJobState(
            current: i,
            total: uris.length,
            phase: 'error',
            results: results,
            error: 'No session id in response',
          ));
          return;
        }
        final item = await _poll(sessionId);
        if (item != null) results.add(item);
      }
      _setState(UploadWardrobeJobState(
        current: uris.length,
        total: uris.length,
        phase: 'done',
        results: results,
      ));
    } catch (err) {
      _setState(UploadWardrobeJobState(
        phase: 'error',
        results: const [],
        error: err is ApiException ? err.message : '$err',
      ));
    }
  }

  File _fileFromUri(String rawUri) {
    final uri = Uri.tryParse(rawUri);
    if (uri != null && uri.isAbsolute && uri.scheme == 'file') {
      return File.fromUri(uri);
    }
    return File(rawUri);
  }

  Future<Uint8List> _readFile(String uri) => _fileFromUri(uri).readAsBytes();

  String _mimeFor(String uri) =>
      uri.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';

  /// Downscales to ≤1024px when the source file is very large, re-encoding to
  /// PNG so no extra codec dependency is needed. Returns (bytes, mimeType).
  Future<(Uint8List, String)> _prepare(Uint8List bytes, String uri) async {
    final mime = _mimeFor(uri);
    if (bytes.length < 8 * 1024 * 1024) return (bytes, mime);
    try {
      final codec =
          await ui.instantiateImageCodec(bytes, targetWidth: 1024, targetHeight: 1024);
      final frame = await codec.getNextFrame();
      final data = await frame.image.toByteData(format: ui.ImageByteFormat.png);
      if (data == null) return (bytes, mime);
      return (data.buffer.asUint8List(), 'image/png');
    } catch (_) {
      return (bytes, mime);
    }
  }

  Future<String?> _start(Uint8List bytes, String mime) async {
    final api = ref.read(apiClientProvider);
    final started = await api.post(
      ApiEndpoints.wardrobeUpload,
      body: {'imageBase64': base64Encode(bytes), 'mimeType': mime},
    );
    if (started is Map && started['sessionId'] is String) {
      return started['sessionId'] as String;
    }
    return null;
  }

  /// Polls progress; returns the processed item, or null when the photo was
  /// unsupported/errored so the loop can continue.
  Future<Map<String, dynamic>?> _poll(String sessionId) async {
    final api = ref.read(apiClientProvider);
    for (var attempt = 0; attempt < _maxAttempts; attempt++) {
      final res = await api.get(ApiEndpoints.wardrobeUploadProgress(sessionId));
      if (res is Map) {
        final map = Map<String, dynamic>.from(res);
        final phase = map['phase'] as String?;
        if (phase == 'done') {
          final result = map['result'] as String?;
          final items = map['items'] as List?;
          if (result == 'no_error' && items != null && items.isNotEmpty) {
            return Map<String, dynamic>.from(items.first as Map);
          }
          return null;
        }
        if (phase == 'error') return null;
      }
      await Future<void>.delayed(_pollInterval);
    }
    return null;
  }

  void _setState(UploadWardrobeJobState value) {
    try {
      state = AsyncValue.data(value);
    } on StateError {
      // Notifier disposed while the job was in flight; ignore.
    }
  }
}

final uploadWardrobeJobProvider =
    AsyncNotifierProvider<UploadWardrobeJobNotifier, UploadWardrobeJobState>(
        UploadWardrobeJobNotifier.new);

/// Kicks off the sequential upload for the picked [uris] (a JSON-encoded
/// list) and shows a progress carousel. On completion routes to the review
/// screen with the accumulated results as prefills.
class UploadWardrobeScreen extends ConsumerStatefulWidget {
  const UploadWardrobeScreen({super.key, this.uris});

  final String? uris;

  @override
  ConsumerState<UploadWardrobeScreen> createState() =>
      _UploadWardrobeScreenState();
}

class _UploadWardrobeScreenState extends ConsumerState<UploadWardrobeScreen> {
  bool _navigated = false;
  List<String> _uris = const [];

  static List<String> _parseUris(String? raw) {
    if (raw == null || raw.isEmpty) return const [];
    final list = jsonDecode(raw);
    return (list as List).cast<String>();
  }

  @override
  void initState() {
    super.initState();
    _uris = _parseUris(widget.uris);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) {
        ref.read(uploadWardrobeJobProvider.notifier).startJob(uris: _uris);
      }
    });
  }

  void _goTo(String location) {
    if (_navigated) return;
    _navigated = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) context.push(location);
    });
  }

  @override
  Widget build(BuildContext context) {
    ref.listen(uploadWardrobeJobProvider, (previous, next) {
      final value = next.value;
      if (value == null || _navigated) return;
      if (value.isDone) {
        final urisEncoded =
            Uri.encodeQueryComponent(jsonEncode(_uris));
        final prefillsEncoded =
            Uri.encodeQueryComponent(jsonEncode(value.results));
        _goTo('/upload-wardrobe-review?uris=$urisEncoded&prefills=$prefillsEncoded');
      }
    });

    final job = ref.watch(uploadWardrobeJobProvider).value;

    return Scaffold(
      backgroundColor: AppColors.page,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 24, 20, 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const _Title(),
              const SizedBox(height: 4),
              Text(
                'Adding photos to your wardrobe',
                style: AppTypography.body.copyWith(color: AppColors.textPrimary),
              ),
              const SizedBox(height: 32),
              if (job == null)
                const Center(
                    child: CircularProgressIndicator(strokeWidth: 3, color: AppColors.dark))
              else if (job.isError)
                _ErrorPanel(
                  message: job.error ?? 'Could not process these photos',
                  onRetry: () => ref
                      .read(uploadWardrobeJobProvider.notifier)
                      .startJob(uris: _uris),
                  onClose: () => context.pop(),
                )
              else
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Expanded(child: _PhotoCarousel(uris: _uris, job: job)),
                      const SizedBox(height: 20),
                      Center(
                        child: Text(
                          job.total == 0
                              ? 'Analyzing…'
                              : 'Photo ${job.current + 1} of ${job.total}',
                          style: AppTypography.body
                              .copyWith(color: AppColors.textPrimary),
                        ),
                      ),
                      const SizedBox(height: 6),
                      const Center(
                        child: Text(
                          'Analyzing item',
                          style: AppTypography.caption,
                        ),
                      ),
                      const SizedBox(height: 16),
                      const Center(
                        child: SizedBox(
                          width: 24,
                          height: 24,
                          child: CircularProgressIndicator(
                              strokeWidth: 3, color: AppColors.dark),
                        ),
                      ),
                    ],
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Title extends StatelessWidget {
  const _Title();

  @override
  Widget build(BuildContext context) {
    const bebas = TextStyle(
      fontFamily: 'BebasNeue',
      fontSize: 36,
      height: 40 / 36,
      letterSpacing: 0.5,
      color: AppColors.textPrimary,
    );
    const kirang = TextStyle(
      fontFamily: 'KirangHaerang',
      fontSize: 44,
      height: 44 / 44,
      color: AppColors.textPrimary,
    );
    return const Text.rich(
      TextSpan(
        style: bebas,
        children: [
          TextSpan(text: 'UP'),
          TextSpan(text: 'L', style: kirang),
          TextSpan(text: 'OADING WAR'),
          TextSpan(text: 'D', style: kirang),
          TextSpan(text: 'R'),
          TextSpan(text: 'O', style: kirang),
          TextSpan(text: 'BE'),
        ],
      ),
    );
  }
}

/// Horizontal carousel of the picked photos. The photo being processed is
/// highlighted; completed photos show a check badge.
class _PhotoCarousel extends StatelessWidget {
  const _PhotoCarousel({required this.uris, required this.job});

  final List<String> uris;
  final UploadWardrobeJobState job;

  @override
  Widget build(BuildContext context) {
    if (uris.isEmpty) {
      return const ColoredBox(color: AppColors.chip);
    }
    return ListView.separated(
      scrollDirection: Axis.horizontal,
      itemCount: uris.length,
      separatorBuilder: (_, __) => const SizedBox(width: 8),
      itemBuilder: (context, index) {
        final isCurrent = index == job.current;
        final isDone = index < job.current;
        final file = _fileFor(uris[index]);
        return Container(
          width: 140,
          decoration: BoxDecoration(
            color: AppColors.chip,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(
              color: isCurrent ? AppColors.dark : Colors.transparent,
              width: 2,
            ),
          ),
          clipBehavior: Clip.hardEdge,
          child: Stack(
            fit: StackFit.expand,
            children: [
              if (file != null)
                Image.file(
                  file,
                  fit: BoxFit.cover,
                  errorBuilder: (_, __, ___) =>
                      const ColoredBox(color: AppColors.chip),
                )
              else
                const ColoredBox(color: AppColors.chip),
              if (isCurrent)
                Container(
                  color: const Color(0x33000000),
                  child: const Center(
                    child: SizedBox(
                      width: 24,
                      height: 24,
                      child: CircularProgressIndicator(
                          strokeWidth: 3, color: Colors.white),
                    ),
                  ),
                ),
              if (isDone)
                Positioned(
                  top: 6,
                  right: 6,
                  child: Container(
                    padding: const EdgeInsets.all(2),
                    decoration: const BoxDecoration(
                      color: AppColors.doGreen,
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(Icons.check,
                        color: Colors.white, size: 14),
                  ),
                ),
            ],
          ),
        );
      },
    );
  }

  static File? _fileFor(String rawUri) {
    final uri = Uri.tryParse(rawUri);
    if (uri != null && uri.isAbsolute && uri.scheme == 'file') {
      return File.fromUri(uri);
    }
    return File(rawUri);
  }
}

class _ErrorPanel extends StatelessWidget {
  const _ErrorPanel({
    required this.message,
    required this.onRetry,
    required this.onClose,
  });

  final String message;
  final VoidCallback onRetry;
  final VoidCallback onClose;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.error_outline, color: AppColors.dontRed, size: 40),
          const SizedBox(height: 12),
          Text(message,
              textAlign: TextAlign.center,
              style: AppTypography.body.copyWith(color: AppColors.textPrimary)),
          const SizedBox(height: 20),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              OutlinedButton(
                key: const ValueKey('ww_retry'),
                onPressed: onRetry,
                style: OutlinedButton.styleFrom(
                  foregroundColor: AppColors.textPrimary,
                  side: const BorderSide(color: AppColors.hairline),
                  shape: const StadiumBorder(),
                ),
                child: const Text('Try Again', style: AppTypography.buttonLabel),
              ),
              const SizedBox(width: 12),
              OutlinedButton(
                key: const ValueKey('ww_error_close'),
                onPressed: onClose,
                style: OutlinedButton.styleFrom(
                  foregroundColor: AppColors.textPrimary,
                  side: const BorderSide(color: AppColors.hairline),
                  shape: const StadiumBorder(),
                ),
                child: const Text('Go Back', style: AppTypography.buttonLabel),
              ),
            ],
          ),
        ],
      ),
    );
  }
}