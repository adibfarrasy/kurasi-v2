import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/api/api_exception.dart';
import '../../core/api/api_providers.dart';
import '../../core/api/endpoints.dart';
import '../../core/theme/app_colors.dart';
import '../tryon/steal_the_look_draft.dart';

const List<String> _stlStages = ['Analyzing', 'Optimizing image', 'Finalizing style'];

/// Snapshot of the steal-the-look job. Mirrors the backend `StlProgress`
/// payload: [phase] while the pipeline runs, [result]/[heroImageUrl]/
/// [items]/[tone] once done, [error] on failure.
class StealTheLookJobState {
  const StealTheLookJobState({
    this.phase = 'idle',
    this.result,
    this.heroImageUrl,
    this.items,
    this.tone,
    this.error,
  });

  final String phase;
  final String? result;
  final String? heroImageUrl;
  final List<dynamic>? items;
  final String? tone;
  final String? error;

  bool get isDone => phase == 'done';
  bool get isError => phase == 'error';

  /// Collapses the backend phases onto the user-facing stage carousel:
  /// detect → Analyzing (0), extract/refine → Optimizing image (1),
  /// done → Finalizing style (2).
  int get stageIndex {
    switch (phase) {
      case 'extract':
      case 'refine':
        return 1;
      case 'done':
        return 2;
      default:
        return 0;
    }
  }
}

/// Drives the steal-the-look job: reads the inspiration image bytes, POSTs
/// them to `stealTheLook`, polls `stealTheLookProgress` every second until
/// `done`/`error`, and persists the successful result as the try-on draft.
class StealTheLookJobNotifier extends AsyncNotifier<StealTheLookJobState> {
  static const _pollInterval = Duration(seconds: 1);
  static const _maxAttempts = 60;

  @override
  Future<StealTheLookJobState> build() async => const StealTheLookJobState();

  Future<void> startJob({required String uri}) async {
    state = const AsyncValue.loading();
    try {
      final bytes = await _readFile(uri);
      final sessionId = await _start(uri, bytes);
      if (sessionId == null) {
        _setState(const StealTheLookJobState(
          phase: 'error',
          error: 'No session id in response',
        ));
        return;
      }
      await _poll(sessionId);
    } catch (err) {
      _setState(StealTheLookJobState(
        phase: 'error',
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

  Future<String?> _start(String uri, Uint8List bytes) async {
    final api = ref.read(apiClientProvider);
    final started = await api.post(
      ApiEndpoints.stealTheLook,
      body: {
        'imageBase64': base64Encode(bytes),
        'mimeType': _mimeFor(uri),
      },
    );
    if (started is Map && started['sessionId'] is String) {
      return started['sessionId'] as String;
    }
    return null;
  }

  Future<void> _poll(String sessionId) async {
    final api = ref.read(apiClientProvider);
    for (var attempt = 0; attempt < _maxAttempts; attempt++) {
      final res = await api.get(ApiEndpoints.stealTheLookProgress(sessionId));
      if (res is Map) {
        final map = Map<String, dynamic>.from(res);
        final phase = map['phase'] as String?;
        if (phase == 'done') {
          final state = StealTheLookJobState(
            phase: 'done',
            result: (map['result'] as String?) ?? 'unknown',
            heroImageUrl: map['heroImageUrl'] as String?,
            items: (map['items'] as List?)?.toList(),
            tone: map['tone'] as String?,
          );
          _setState(state);
          if (state.result == 'no_error') {
            await _persistDraft(map);
          }
          return;
        }
        if (phase == 'error') {
          _setState(StealTheLookJobState(
            phase: 'error',
            error: (map['message'] as String?) ?? 'Could not process this photo',
          ));
          return;
        }
        if (phase == 'detect' || phase == 'extract' || phase == 'refine') {
          _setState(StealTheLookJobState(phase: phase!));
        }
      }
      await Future<void>.delayed(_pollInterval);
    }
    _setState(const StealTheLookJobState(phase: 'error', error: 'Timed out'));
  }

  Future<void> _persistDraft(Map<String, dynamic> res) async {
    final draft = <String, dynamic>{
      'phase': res['phase'],
      'result': res['result'],
      'heroImageUrl': res['heroImageUrl'],
      'items': res['items'],
      'tone': res['tone'],
    };
    ref.read(stealTheLookDraftProvider.notifier).state = draft;
    await StealTheLookDraft.save(draft);
  }

  void _setState(StealTheLookJobState value) {
    try {
      state = AsyncValue.data(value);
    } on StateError {
      // Notifier disposed while the job was in flight; ignore.
    }
  }
}

final stealTheLookJobProvider =
    AsyncNotifierProvider<StealTheLookJobNotifier, StealTheLookJobState>(
        StealTheLookJobNotifier.new);

/// Kicks off the steal-the-look job for the picked [uri] and shows the
/// staged progress carousel. On success the notifier sets the try-on draft
/// and this screen routes to /tryon; on failure it routes to the failed
/// screen with the reason in the query string.
class StealTheLookAnalyzingScreen extends ConsumerStatefulWidget {
  const StealTheLookAnalyzingScreen({super.key, this.uri});

  final String? uri;

  @override
  ConsumerState<StealTheLookAnalyzingScreen> createState() =>
      _StealTheLookAnalyzingScreenState();
}

class _StealTheLookAnalyzingScreenState
    extends ConsumerState<StealTheLookAnalyzingScreen> {
  bool _navigated = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _kickoff());
  }

  void _kickoff() {
    final uri = widget.uri;
    if (uri == null || uri.isEmpty) {
      _goTo(_failedLocation(uri: uri));
      return;
    }
    ref.read(stealTheLookJobProvider.notifier).startJob(uri: uri);
  }

  void _goTo(String location) {
    if (_navigated) return;
    _navigated = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) context.go(location);
    });
  }

  /// Builds the failed-screen location, carrying the reason, the offending
  /// photo [uri] and (on phase errors) the backend [message].
  String _failedLocation({String? reason, String? uri, String? message}) {
    return Uri(
      path: '/steal-the-look/failed',
      queryParameters: {
        'reason': reason ?? 'unknown',
        if (uri != null && uri.isNotEmpty) 'uri': uri,
        if (message != null && message.isNotEmpty) 'message': message,
      },
    ).toString();
  }

  @override
  Widget build(BuildContext context) {
    ref.listen(stealTheLookJobProvider, (previous, next) {
      final value = next.value;
      if (value == null || _navigated) return;
      if (value.isDone) {
        if (value.result == 'no_error') {
          _goTo('/tryon');
        } else {
          _goTo(_failedLocation(reason: value.result, uri: widget.uri));
        }
      } else if (value.isError) {
        _goTo(_failedLocation(
          reason: 'unknown',
          uri: widget.uri,
          message: value.error,
        ));
      }
    });

    final stageIndex = ref.watch(stealTheLookJobProvider).value?.stageIndex ?? 0;

    return Scaffold(
      backgroundColor: AppColors.page,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 24, 20, 32),
          child: Column(
            children: [
              Expanded(child: _ImageFrame(uri: widget.uri)),
              const SizedBox(height: 24),
              _StageCarousel(stageIndex: stageIndex),
            ],
          ),
        ),
      ),
    );
  }
}

/// The picked inspiration photo in a white frame (fallback: empty canvas).
class _ImageFrame extends StatelessWidget {
  const _ImageFrame({this.uri});

  final String? uri;

  @override
  Widget build(BuildContext context) {
    final file = _fileFor(uri);
    return Container(
      width: double.infinity,
      decoration: BoxDecoration(
        color: AppColors.chip,
        borderRadius: BorderRadius.circular(4),
        border: Border.all(color: Colors.white, width: 5),
        boxShadow: const [
          BoxShadow(
            color: Color(0x66000000),
            blurRadius: 4,
            offset: Offset(0, 2),
          ),
        ],
      ),
      clipBehavior: Clip.hardEdge,
      child: file == null
          ? const ColoredBox(color: AppColors.chip)
          : Image.file(
              file,
              fit: BoxFit.cover,
              errorBuilder: (_, __, ___) =>
                  const ColoredBox(color: AppColors.chip),
            ),
    );
  }

  static File? _fileFor(String? rawUri) {
    if (rawUri == null || rawUri.isEmpty) return null;
    final uri = Uri.tryParse(rawUri);
    if (uri != null && uri.isAbsolute && uri.scheme == 'file') {
      return File.fromUri(uri);
    }
    return File(rawUri);
  }
}

/// Spinner + the three-stage progress carousel; the active stage is bold,
/// the upcoming stages are dimmed.
class _StageCarousel extends StatelessWidget {
  const _StageCarousel({required this.stageIndex});

  final int stageIndex;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        const SizedBox(
          width: 24,
          height: 24,
          child: CircularProgressIndicator(strokeWidth: 3, color: AppColors.dark),
        ),
        const SizedBox(height: 16),
        SizedBox(
          height: 96,
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              for (var i = 0; i < _stlStages.length; i++)
                AnimatedDefaultTextStyle(
                  duration: const Duration(milliseconds: 200),
                  style: TextStyle(
                    fontFamily: 'FunnelSans',
                    fontSize: 20,
                    height: 24 / 20,
                    letterSpacing: -0.3,
                    fontWeight:
                        i == stageIndex ? FontWeight.w700 : FontWeight.w400,
                    color: i == stageIndex
                        ? AppColors.textPrimary
                        : AppColors.textMuted.withValues(alpha: 0.35),
                  ),
                  child: Text(_stlStages[i], textAlign: TextAlign.center),
                ),
            ],
          ),
        ),
      ],
    );
  }
}