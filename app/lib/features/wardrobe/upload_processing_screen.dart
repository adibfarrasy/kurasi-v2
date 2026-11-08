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
import '../../core/design/stage_carousel.dart';
import '../../core/theme/app_colors.dart';

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
    this.stage = 0,
  });

  /// Index into the user-facing stage carousel for the current photo.
  final int stage;
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
  static const _maxAttempts = 150;

  /// Per-stage dwell; tests shrink it.
  static Duration stageDwell = const Duration(seconds: 1);

  @override
  Future<UploadWardrobeJobState> build() async => const UploadWardrobeJobState();

  Future<void> startJob({required List<String> uris}) async {
    state = const AsyncValue.loading();
    try {
      final results = <Map<String, dynamic>>[];
      for (var i = 0; i < uris.length; i++) {
        void stage(int s) => _setState(UploadWardrobeJobState(current: i, total: uris.length, results: results, stage: s));
        stage(0);
        final uri = uris[i];
        final bytes = await _readFile(uri);
        final (encoded, mime) = await _prepare(bytes, uri);
        // The pipeline does its own stages server side; the dwell keeps the
        // first label on screen long enough to read.
        final started = _start(encoded, mime);
        await Future<void>.delayed(stageDwell * 3);
        stage(1);
        final sessionId = await started;
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
        stage(2);
        await Future<void>.delayed(stageDwell);
        stage(3);
        await Future<void>.delayed(stageDwell);
        if (item != null) results.add(item);
      }
      if (results.isEmpty) {
        _setState(UploadWardrobeJobState(total: uris.length, phase: 'error', error: 'Could not process your photos. Please try again.'));
        return;
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
      if (mounted) context.pushReplacement(location);
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
    final insets = MediaQuery.paddingOf(context);

    return Scaffold(
      backgroundColor: AppColors.page,
      body: Stack(
        children: [
          Padding(
            padding: EdgeInsets.only(top: insets.top + 24, bottom: insets.bottom + 32),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Padding(padding: EdgeInsets.fromLTRB(20, 0, 20, 20), child: _Title()),
                _PhotoCarousel(uris: _uris, current: job?.current ?? 0),
                const SizedBox(height: 32),
                StageCarousel(stages: _stages, active: job?.stage ?? 0, visibleRows: 4),
              ],
            ),
          ),
          if (job?.isError ?? false)
            Positioned.fill(
              child: ColoredBox(
                color: const Color(0x66000000),
                child: Center(
                  child: Container(
                    margin: const EdgeInsets.symmetric(horizontal: 20),
                    constraints: const BoxConstraints(maxWidth: 360),
                    padding: const EdgeInsets.all(24),
                    color: Colors.white,
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        const Text('Upload failed', style: TextStyle(fontFamily: 'FunnelSans', fontWeight: FontWeight.bold, fontSize: 18, height: 24 / 18, color: Colors.black)),
                        const SizedBox(height: 16),
                        Text(job?.error ?? '', style: const TextStyle(fontFamily: 'FunnelSans', fontSize: 14, height: 20 / 14, color: Color(0xFF444444))),
                        const SizedBox(height: 20),
                        GestureDetector(
                          key: const ValueKey('ww_retry'),
                          onTap: () => context.pushReplacement('/upload-wardrobe-guide'),
                          child: Container(
                            height: 48,
                            alignment: Alignment.center,
                            decoration: BoxDecoration(color: Colors.black, borderRadius: BorderRadius.circular(99)),
                            child: const Text('Try again', style: TextStyle(fontFamily: 'FunnelSans', fontWeight: FontWeight.w500, fontSize: 16, letterSpacing: -0.16, color: Colors.white)),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

const List<String> _stages = ['Removing background', 'Optimizing image', 'Prefilling tags', 'Wrapping up'];

class _Title extends StatelessWidget {
  const _Title();

  @override
  Widget build(BuildContext context) {
    const kirang = TextStyle(fontFamily: 'KirangHaerang', fontSize: 58, height: 52 / 58);
    return const Text.rich(TextSpan(
      style: TextStyle(fontFamily: 'BebasNeue', fontSize: 48, height: 52 / 48, color: Colors.black),
      children: [
        TextSpan(text: 'U'),
        TextSpan(text: 'P', style: kirang),
        TextSpan(text: 'LO'),
        TextSpan(text: 'A', style: kirang),
        TextSpan(text: 'D WA'),
        TextSpan(text: 'R', style: kirang),
        TextSpan(text: 'DRO'),
        TextSpan(text: 'B', style: kirang),
        TextSpan(text: 'E'),
      ],
    ));
  }
}

/// Photo cards that auto-advance to the one being processed; the active
/// card tilts slightly.
class _PhotoCarousel extends StatefulWidget {
  const _PhotoCarousel({required this.uris, required this.current});

  final List<String> uris;
  final int current;

  @override
  State<_PhotoCarousel> createState() => _PhotoCarouselState();
}

class _PhotoCarouselState extends State<_PhotoCarousel> {
  PageController? _controller;

  @override
  void didUpdateWidget(covariant _PhotoCarousel old) {
    super.didUpdateWidget(old);
    if (old.current != widget.current && (_controller?.hasClients ?? false) && widget.current < widget.uris.length) {
      _controller!.animateToPage(widget.current, duration: const Duration(milliseconds: 300), curve: Curves.easeOut);
    }
  }

  @override
  void dispose() {
    _controller?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final width = MediaQuery.sizeOf(context).width;
    final cardW = width - 80;
    _controller ??= PageController(viewportFraction: (cardW + 16) / width);
    return SizedBox(
      height: 420,
      child: PageView.builder(
        controller: _controller,
        physics: const NeverScrollableScrollPhysics(),
        clipBehavior: Clip.none,
        itemCount: widget.uris.length,
        itemBuilder: (context, i) {
          final file = _fileFor(widget.uris[i]);
          return Center(
            child: AnimatedRotation(
              turns: i == widget.current ? -2 / 360 : 0,
              duration: const Duration(milliseconds: 300),
              child: Container(
                width: cardW,
                height: 420,
                decoration: BoxDecoration(
                  color: const Color(0xFFCFCFCF),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: Colors.white, width: 5),
                  boxShadow: const [BoxShadow(color: Color(0x66000000), offset: Offset(0.5, 1), blurRadius: 1)],
                ),
                clipBehavior: Clip.antiAlias,
                child: file == null ? null : Image.file(file, fit: BoxFit.cover, errorBuilder: (_, __, ___) => const SizedBox()),
              ),
            ),
          );
        },
      ),
    );
  }

  static File? _fileFor(String rawUri) {
    final uri = Uri.tryParse(rawUri);
    if (uri != null && uri.isAbsolute && uri.scheme == 'file') return File.fromUri(uri);
    return File(rawUri);
  }
}
