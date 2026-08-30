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

  group('extractCode', () {
    test('extracts the exchange code from a callback query string', () {
      expect(service.extractCode('kurasi://callback?code=abc123'), 'abc123');
    });

    test('extracts the exchange code from a callback fragment', () {
      expect(service.extractCode('kurasi://callback#code=abc123'), 'abc123');
    });

    test('extracts the legacy session token params as fallback', () {
      expect(
          service.extractCode('kurasi://callback?kratos_session_token=abc123'),
          'abc123');
      expect(service.extractCode('kurasi://callback#session_token=def456'),
          'def456');
    });

    test('returns null when no code is present', () {
      expect(service.extractCode('kurasi://callback'), isNull);
      expect(service.extractCode('kurasi://callback?error=denied'), isNull);
      expect(service.extractCode('kurasi://callback#code='), isNull);
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

  group('isJwtExpired', () {
    final now = DateTime.fromMillisecondsSinceEpoch(1700000000000);

    test('expired when exp is before now', () {
      expect(
          service.isJwtExpired(
              _jwt('{"exp": ${now.millisecondsSinceEpoch ~/ 1000 - 1}}'),
              now: now),
          isTrue);
    });

    test('not expired while exp is in the future', () {
      expect(
          service.isJwtExpired(
              _jwt('{"exp": ${now.millisecondsSinceEpoch ~/ 1000 + 600}}'),
              now: now),
          isFalse);
    });

    test('expired when the jwt is undecodable or lacks exp', () {
      expect(service.isJwtExpired('not-a-jwt', now: now), isTrue);
      expect(service.isJwtExpired(_jwt('{"sub":"id-123"}'), now: now), isTrue);
    });
  });
}
