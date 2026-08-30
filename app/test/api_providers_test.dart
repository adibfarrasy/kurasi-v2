import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kurasi/core/api/api_providers.dart';
import 'package:kurasi/core/auth/auth_service.dart';
import 'package:kurasi/core/auth/auth_state.dart';

class _FakeAuth implements AuthService {
  bool signedOut = false;
  @override
  Future<AuthUser?> signInWithGoogle() async => null;
  @override
  Future<void> signOut() async => signedOut = true;
  @override
  Stream<AuthUser?> authChanges() async* {
    yield null;
  }

  @override
  Future<String?> currentIdToken() async => null;
}

class _FakeAdapter implements HttpClientAdapter {
  @override
  Future<ResponseBody> fetch(RequestOptions options, Stream<Uint8List>? requestStream, Future<void>? cancelFuture) async {
    return ResponseBody.fromString('{"code":"UNAUTHORIZED","message":"expired"}', 401, headers: {
      Headers.contentTypeHeader: [Headers.jsonContentType],
    });
  }

  @override
  void close({bool force = false}) {}
}

void main() {
  test('401 response signs the user out', () async {
    final fake = _FakeAuth();
    final container = ProviderContainer(overrides: [
      authServiceProvider.overrideWithValue(fake),
    ]);
    addTearDown(container.dispose);
    final dio = container.read(dioProvider);
    dio.httpClientAdapter = _FakeAdapter();
    await expectLater(() => dio.get('/api/me'), throwsA(isA<DioException>()));
    await Future<void>.delayed(Duration.zero);
    expect(fake.signedOut, isTrue);
  });
}