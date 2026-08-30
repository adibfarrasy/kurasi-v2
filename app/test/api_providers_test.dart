import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kurasi/core/api/api_providers.dart';
import 'package:kurasi/core/auth/auth_service.dart';
import 'package:kurasi/core/auth/auth_state.dart';

class _FakeAuth implements AuthService {
  _FakeAuth({this.refreshToken});
  final String? refreshToken;
  bool signedOut = false;
  bool refreshed = false;

  @override
  Future<AuthUser?> signInWithGoogle() async => null;
  @override
  Future<void> signOut() async => signedOut = true;
  @override
  Stream<AuthUser?> authChanges() async* {
    yield null;
  }

  @override
  Future<String?> currentIdToken() async =>
      refreshed ? refreshToken : 'existing.jwt';
  @override
  Future<String?> refreshTokenIfNeeded() async {
    refreshed = true;
    return refreshToken;
  }

  @override
  String? extractCode(String redirectUrl) => null;
  @override
  AuthUser? userFromJwt(String jwt) => null;
  @override
  bool isJwtExpired(String jwt, {DateTime? now}) => false;
}

/// Returns 401 until the request carries the `_retried` marker, then 200.
class _RetryAdapter implements HttpClientAdapter {
  @override
  Future<ResponseBody> fetch(RequestOptions options,
      Stream<Uint8List>? requestStream, Future<void>? cancelFuture) async {
    final retried = options.extra['_retried'] == true;
    if (!retried) {
      return ResponseBody.fromString(
          '{"code":"UNAUTHORIZED","message":"expired"}', 401,
          headers: {
            Headers.contentTypeHeader: [Headers.jsonContentType],
          });
    }
    expect(options.headers['Authorization'], 'Bearer fresh.jwt');
    return ResponseBody.fromString('{"id":"u1"}', 200, headers: {
      Headers.contentTypeHeader: [Headers.jsonContentType],
    });
  }

  @override
  void close({bool force = false}) {}
}

/// Always returns 401.
class _FakeAdapter implements HttpClientAdapter {
  @override
  Future<ResponseBody> fetch(RequestOptions options,
      Stream<Uint8List>? requestStream, Future<void>? cancelFuture) async {
    return ResponseBody.fromString(
        '{"code":"UNAUTHORIZED","message":"expired"}', 401,
        headers: {
          Headers.contentTypeHeader: [Headers.jsonContentType],
        });
  }

  @override
  void close({bool force = false}) {}
}

void main() {
  test('401 refreshes the token and retries once', () async {
    final fake = _FakeAuth(refreshToken: 'fresh.jwt');
    final container = ProviderContainer(overrides: [
      authServiceProvider.overrideWithValue(fake),
    ]);
    addTearDown(container.dispose);
    final dio = container.read(dioProvider);
    dio.httpClientAdapter = _RetryAdapter();
    final res = await dio.get('/api/me');
    expect(res.data, {'id': 'u1'});
    expect(fake.refreshed, isTrue);
    expect(fake.signedOut, isFalse);
  });

  test('401 with failed refresh signs the user out', () async {
    final fake = _FakeAuth(refreshToken: null);
    final container = ProviderContainer(overrides: [
      authServiceProvider.overrideWithValue(fake),
    ]);
    addTearDown(container.dispose);
    final dio = container.read(dioProvider);
    dio.httpClientAdapter = _FakeAdapter();
    await expectLater(() => dio.get('/api/me'), throwsA(isA<DioException>()));
    await Future<void>.delayed(Duration.zero);
    expect(fake.refreshed, isTrue);
    expect(fake.signedOut, isTrue);
  });
}
