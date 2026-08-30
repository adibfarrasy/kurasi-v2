import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kurasi/core/api/api_client.dart';
import 'package:kurasi/core/api/api_providers.dart';
import 'package:kurasi/features/onboarding/avatar_job_state.dart';

class _FakeApi implements ApiClient {
  _FakeApi(this.responses);
  final List<Map<String, dynamic>> responses;
  int _calls = 0;
  @override
  final Dio dio = Dio();
  @override
  Future<dynamic> get(String path, {Map<String, dynamic>? query}) async => responses[_calls++];
  @override
  Future<dynamic> post(String path, {Object? body}) async => responses[_calls++];
  @override
  Future<dynamic> patch(String path, {Object? body}) async => throw UnimplementedError();
  @override
  Future<dynamic> delete(String path, {Object? body}) async => throw UnimplementedError();
}

Future<String> _tempFaceFile() async {
  final file = File('${Directory.systemTemp.path}/face_${DateTime.now().microsecondsSinceEpoch}.jpg');
  await file.writeAsBytes(List<int>.filled(64, 7));
  addTearDown(() => file.delete());
  return file.uri.toString();
}

void main() {
  test('job completes from done phase', () async {
    final container = ProviderContainer(overrides: [
      apiClientProvider.overrideWithValue(_FakeApi([
        {'sessionId': 's1'},
        {'phase': 'done', 'avatarUrl': 'https://x/avatar.png'},
      ])),
    ]);
    addTearDown(container.dispose);
    final uri = await _tempFaceFile();
    await container.read(avatarJobStateProvider.notifier).startAvatarJob(uri: uri);
    final state = container.read(avatarJobStateProvider);
    expect(state.value?.resultUrl, 'https://x/avatar.png');
    expect(state.value?.phase, 'done');
  });

  test('job surfaces error phase', () async {
    final container = ProviderContainer(overrides: [
      apiClientProvider.overrideWithValue(_FakeApi([
        {'sessionId': 's1'},
        {'phase': 'error', 'error': 'face not found'},
      ])),
    ]);
    addTearDown(container.dispose);
    final uri = await _tempFaceFile();
    await container.read(avatarJobStateProvider.notifier).startAvatarJob(uri: uri);
    final state = container.read(avatarJobStateProvider);
    expect(state.value?.phase, 'error');
    expect(state.value?.error, 'face not found');
  });
}