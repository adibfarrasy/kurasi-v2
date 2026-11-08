import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/api/api_exception.dart';
import '../../core/api/api_providers.dart';
import '../../core/api/endpoints.dart';
import '../../core/design/stage_carousel.dart';
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
  // Detection plus per-item extraction runs several fal calls.
  static const _maxAttempts = 300;

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
          // Hold on "Finalizing style" briefly so the last stage registers.
          _navigated = true;
          final router = GoRouter.of(context);
          Future.delayed(const Duration(seconds: 3), () {
            if (mounted) router.go('/tryon');
          });
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
    final insets = MediaQuery.paddingOf(context);
    final file = _fileFor(widget.uri);

    return Scaffold(
      backgroundColor: AppColors.page,
      body: Padding(
        padding: EdgeInsets.fromLTRB(20, insets.top + 24, 20, insets.bottom + 32),
        child: Column(
          children: [
            Flexible(
              child: Container(
                constraints: const BoxConstraints(maxWidth: 353, maxHeight: 530),
                decoration: BoxDecoration(
                  color: const Color(0xFFDCDCDC),
                  borderRadius: BorderRadius.circular(4),
                  border: Border.all(color: Colors.white, width: 5),
                  boxShadow: const [BoxShadow(color: Color(0x66000000), offset: Offset(0.5, 1), blurRadius: 1)],
                ),
                clipBehavior: Clip.hardEdge,
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    file == null
                        ? Image.asset('assets/default-man.png', fit: BoxFit.cover)
                        : Image.file(file, fit: BoxFit.cover, errorBuilder: (_, __, ___) => const SizedBox()),
                    const _Beam(),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 24),
            StageCarousel(stages: _stlStages, active: stageIndex),
          ],
        ),
      ),
    );
  }

  static File? _fileFor(String? rawUri) {
    if (rawUri == null || rawUri.isEmpty) return null;
    final uri = Uri.tryParse(rawUri);
    if (uri != null && uri.isAbsolute && uri.scheme == 'file') return File.fromUri(uri);
    return File(rawUri);
  }
}

/// Diagonal light sweep across the photo while the analyzer runs.
class _Beam extends StatefulWidget {
  const _Beam();

  @override
  State<_Beam> createState() => _BeamState();
}

class _BeamState extends State<_Beam> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 1800))..repeat();

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return IgnorePointer(
      child: AnimatedBuilder(
        animation: _c,
        builder: (context, _) => OverflowBox(
          maxHeight: double.infinity,
          child: Transform.translate(
            offset: Offset(-260 + 520 * _c.value, 0),
            child: Transform.rotate(
              angle: 20 * 3.14159 / 180,
              child: Container(
                width: 180,
                height: 700,
                decoration: const BoxDecoration(
                  gradient: LinearGradient(colors: [Color(0x00FFFFFF), Color(0xD9FFFFFF), Color(0x00FFFFFF)]),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
