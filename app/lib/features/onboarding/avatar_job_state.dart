import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api/api_exception.dart';
import '../../core/api/api_providers.dart';
import '../../core/api/endpoints.dart';
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
/// Port of RN `avatarJobState`; backend persists `default_avatar_url`.
class AvatarJobNotifier extends AsyncNotifier<AvatarJobState> {
  static const _pollInterval = Duration(milliseconds: 800);

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
      final sessionId = await _start(bytes);
      if (sessionId == null) {
        state = AsyncValue.error(ApiException('INVALID_RESPONSE', 'No session id in response', null), StackTrace.current);
        return;
      }
      await _poll(sessionId);
    } catch (err, stack) {
      state = AsyncValue.error(err, stack);
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

  Future<String?> _start(Uint8List bytes) async {
    final api = ref.read(apiClientProvider);
    final started = await api.post(
      ApiEndpoints.normalizeAvatar,
      body: {
        'imageBase64': base64Encode(bytes),
        'mimeType': 'image/jpeg',
        'gender': ref.read(genderProvider),
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
    while (true) {
      final res = await api.get(ApiEndpoints.normalizeAvatarProgress(sessionId));
      if (res is Map) {
        final phase = res['phase'] as String?;
        if (phase == 'done') {
          state = AsyncValue.data(AvatarJobState(
            sessionId: sessionId,
            phase: 'done',
            resultUrl: res['avatarUrl'] as String?,
          ));
          return;
        }
        if (phase == 'error') {
          state = AsyncValue.data(AvatarJobState(
            sessionId: sessionId,
            phase: 'error',
            error: (res['error'] as String?) ?? 'Avatar generation failed',
          ));
          return;
        }
      }
      await Future<void>.delayed(_pollInterval);
    }
  }
}

final avatarJobStateProvider =
    AsyncNotifierProvider<AvatarJobNotifier, AvatarJobState>(AvatarJobNotifier.new);