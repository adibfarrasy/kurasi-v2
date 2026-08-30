import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kurasi/core/auth/auth_service.dart';
import 'package:kurasi/core/auth/kratos_client.dart';

String _jwt(String payload) {
  final header = base64Url.encode(utf8.encode('{"alg":"none"}'));
  final body = base64Url.encode(utf8.encode(payload));
  return '$header.$body.sig';
}

void main() {
  final service = AuthService(
    kratos: KratosClient(baseUrl: 'http://kratos:4433'),
    storage: const FlutterSecureStorage(),
  );

  group('extractSessionToken', () {
    test('extracts the token from a callback fragment', () {
      expect(service.extractSessionToken('kurasi://callback#session_token=abc123'), 'abc123');
      expect(service.extractSessionToken('kurasi://callback#access_token=xyz&scope=openid'), 'xyz');
    });

    test('extracts the token from a query string', () {
      expect(service.extractSessionToken('kurasi://callback?kratos_session_token=abc123'), 'abc123');
      expect(service.extractSessionToken('kurasi://callback?session_token=def456'), 'def456');
    });

    test('returns null when no token is present', () {
      expect(service.extractSessionToken('kurasi://callback'), isNull);
      expect(service.extractSessionToken('kurasi://callback?error=denied'), isNull);
      expect(service.extractSessionToken('kurasi://callback#session='), isNull);
    });
  });

  group('userFromJwt', () {
    test('decodes the payload into an AuthUser', () {
      final jwt = _jwt(
        '{"sub":"id-123","email":"ada@example.com","name":"Ada","picture":"https://p/ada.png"}',
      );
      final user = service.userFromJwt(jwt);
      expect(user, isNotNull);
      expect(user!.id, 'id-123');
      expect(user.email, 'ada@example.com');
      expect(user.name, 'Ada');
      expect(user.photoUrl, 'https://p/ada.png');
    });

    test('returns null when the sub claim is missing', () {
      expect(service.userFromJwt(_jwt('{"email":"ada@example.com"}')), isNull);
    });

    test('returns null for a malformed jwt', () {
      expect(service.userFromJwt('not-a-jwt'), isNull);
      expect(service.userFromJwt('header.only'), isNull);
      expect(service.userFromJwt('a.b.c'), isNull);
      expect(service.userFromJwt(List.filled(100, 'x').join()), isNull);
      expect(service.userFromJwt(_jwt('not json')), isNull);
    });
  });
}