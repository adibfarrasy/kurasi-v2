import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api/api_exception.dart';
import '../../core/api/api_providers.dart';
import '../../core/api/endpoints.dart';
import '../tryon/hero_floor.dart' show biometricsProvider;
import 'profile_state.dart';

/// Phases: idle → pending → done | error.
/// [AvatarJobState] is the result of the backend avatar-normalize job:
/// [sessionId] from the POST, [resultUrl] once done, [error] on failure.
class AvatarJobState {
  const AvatarJobState({
    this.sessionId,
    this.phase = 'idle',
    this.resultUrl,
    this.error,
  });

  final String? sessionId;
  final String phase;
  final String? resultUrl;
  final String? error;

  bool get isDone => phase == 'done';
  bool get isError => phase == 'error';

  AvatarJobState copyWith({String? sessionId, String? phase, String? resultUrl, String? error}) {
    return AvatarJobState(
      sessionId: sessionId ?? this.sessionId,
      phase: phase ?? this.phase,
      resultUrl: resultUrl ?? this.resultUrl,
      error: error ?? this.error,
    );
  }
}

/// Drives the avatar-normalize job: reads the face photo bytes, POSTs them to
/// `normalizeAvatar`, then polls `normalizeAvatarProgress` until `done`/`error`.
class AvatarJobNotifier extends AsyncNotifier<AvatarJobState> {
  static const _pollInterval = Duration(milliseconds: 800);
  // The backend chains five fal calls (classify, two seedream passes,
  // faceswap, rembg); the turntable after them is not waited on.
  static const _maxAttempts = 750;

  @override
  Future<AvatarJobState> build() async => const AvatarJobState();

  /// Resets the job so a freshly captured face starts from scratch.
  void reset() {
    state = const AsyncValue.data(AvatarJobState());
  }

  Future<void> startAvatarJob({required String uri}) async {
    state = const AsyncValue.loading();
    try {
      final bytes = await _readFile(uri);
      final sessionId = await _start(uri, bytes);
      if (sessionId == null) {
        _setError(ApiException('INVALID_RESPONSE', 'No session id in response', null));
        return;
      }
      _setState(AsyncValue.data(AvatarJobState(sessionId: sessionId, phase: 'classify')));
      await _poll(sessionId);
    } catch (err, stack) {
      _setState(AsyncValue.error(err, stack));
    }
  }

  Future<Uint8List> _readFile(String rawUri) async {
    final file = _fileFromUri(rawUri);
    return file.readAsBytes();
  }

  File _fileFromUri(String rawUri) {
    final uri = Uri.tryParse(rawUri);
    if (uri != null && uri.isAbsolute && uri.scheme == 'file') {
      return File.fromUri(uri);
    }
    return File(rawUri);
  }

  String _mimeFor(String uri) {
    return uri.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
  }

  Future<String?> _start(String uri, Uint8List bytes) async {
    final api = ref.read(apiClientProvider);
    final started = await api.post(
      ApiEndpoints.normalizeAvatar,
      body: {
        'imageBase64': base64Encode(bytes),
        'mimeType': _mimeFor(uri),
        // The picker holds display labels; the API only accepts masc/femme.
        'gender': ref.read(genderProvider) == 'Female' ? 'femme' : 'masc',
        'heightCm': ref.read(heightProvider),
        'weightKg': ref.read(weightProvider),
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
      final res = await api.get(ApiEndpoints.normalizeAvatarProgress(sessionId));
      if (res is Map) {
        final phase = res['phase'] as String?;
        // The still arrives before the turntable finishes; the backend
        // persists the turntable itself, so stop waiting once the still is in.
        if (phase == 'done' || (phase == 'turntable' && res['avatarUrl'] != null)) {
          // Try On reads the new avatar (and later its turntable) from biometrics.
          ref.invalidate(biometricsProvider);
          _setState(AsyncValue.data(AvatarJobState(
            sessionId: sessionId,
            phase: 'done',
            resultUrl: res['avatarUrl'] as String?,
          )));
          return;
        }
        if (phase == 'error') {
          _setState(AsyncValue.data(AvatarJobState(
            sessionId: sessionId,
            phase: 'error',
            error: (res['message'] as String?) ?? 'Avatar generation failed',
          )));
          return;
        }
        if (phase != null) _setState(AsyncValue.data(AvatarJobState(sessionId: sessionId, phase: phase)));
      }
      await Future<void>.delayed(_pollInterval);
    }
    _setError('Timed out', sessionId: sessionId);
  }

  void _setState(AsyncValue<AvatarJobState> value) {
    try {
      state = value;
    } on StateError {
      // Notifier disposed while the job was in flight; ignore.
    }
  }

  void _setError(Object error, {String? sessionId}) {
    if (error is ApiException) {
      _setState(AsyncValue.error(error, StackTrace.current));
    } else {
      _setState(AsyncValue.data(AvatarJobState(
        sessionId: sessionId,
        phase: 'error',
        error: error as String,
      )));
    }
  }
}

final avatarJobStateProvider =
    AsyncNotifierProvider<AvatarJobNotifier, AvatarJobState>(AvatarJobNotifier.new);