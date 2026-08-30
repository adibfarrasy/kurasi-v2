import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:kurasi/core/auth/kratos_client.dart';

void main() {
  const baseUrl = 'http://kratos:4433';

  test('whoami with tokenize_as returns session token', () async {
    final fake = MockClient((request) async {
      expect(request.method, 'GET');
      expect(request.url.toString(), '$baseUrl/sessions/whoami?tokenize_as=api');
      expect(request.headers['Authorization'], 'Bearer sess-token');
      return http.Response(jsonEncode({'jwt': 'tokenized.jwt.payload'}), 200);
    });
    final client = KratosClient(baseUrl: baseUrl, http: fake);
    final token = await client.tokenize(sessionToken: 'sess-token');
    expect(token, 'tokenized.jwt.payload');
  });

  test('tokenize throws when jwt is missing', () async {
    final fake = MockClient((_) async => http.Response(jsonEncode({'active': true}), 200));
    final client = KratosClient(baseUrl: baseUrl, http: fake);
    expect(() => client.tokenize(sessionToken: 'sess-token'), throwsA(isA<KratosException>()));
  });

  test('tokenize throws on non-2xx', () async {
    final fake = MockClient((_) async => http.Response('{"error":true}', 401));
    final client = KratosClient(baseUrl: baseUrl, http: fake);
    expect(() => client.tokenize(sessionToken: 'sess-token'), throwsA(isA<KratosException>()));
  });

  test('signOut deletes the session with the token', () async {
    final fake = MockClient((request) async {
      expect(request.method, 'DELETE');
      expect(request.url.toString(), '$baseUrl/sessions');
      expect(request.headers['Authorization'], 'Bearer sess-token');
      return http.Response('', 204);
    });
    final client = KratosClient(baseUrl: baseUrl, http: fake);
    await client.signOut(sessionToken: 'sess-token');
  });

  test('signOut throws on non-2xx', () async {
    final fake = MockClient((_) async => http.Response('', 500));
    final client = KratosClient(baseUrl: baseUrl, http: fake);
    expect(() => client.signOut(sessionToken: 'sess-token'), throwsA(isA<KratosException>()));
  });
}