import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:kurasi/core/auth/kratos_client.dart';

void main() {
  const baseUrl = 'http://kratos:4433';

  test('getLoginFlow starts the api login flow', () async {
    final fake = MockClient((request) async {
      expect(request.method, 'GET');
      expect(request.url.path, '/self-service/login/api');
      expect(request.headers['Accept'], 'application/json');
      expect(request.url.queryParameters['return_session_token_exchange_code'],
          'true');
      expect(request.url.queryParameters['return_to'], 'kurasi://callback');
      return http.Response(
          jsonEncode({
            'id': 'flow-123',
            'ui': {'nodes': []}
          }),
          200);
    });
    final client = KratosClient(baseUrl: baseUrl, http: fake);
    final flowId = await client.getLoginFlow();
    expect(flowId, 'flow-123');
  });

  test('getLoginFlow throws when id is missing', () async {
    final fake =
        MockClient((_) async => http.Response(jsonEncode({'ui': {}}), 200));
    final client = KratosClient(baseUrl: baseUrl, http: fake);
    expect(() => client.getLoginFlow(), throwsA(isA<KratosException>()));
  });

  test('getLoginFlow throws on non-2xx', () async {
    final fake = MockClient((_) async => http.Response('{"error":true}', 500));
    final client = KratosClient(baseUrl: baseUrl, http: fake);
    expect(() => client.getLoginFlow(), throwsA(isA<KratosException>()));
  });

  test('submitOidc posts the google provider and returns redirect_browser_to',
      () async {
    final fake = MockClient((request) async {
      expect(request.method, 'POST');
      expect(request.url.path, '/self-service/login/strategies/oidc');
      expect(
          jsonDecode(request.body), {'flow': 'flow-123', 'provider': 'google'});
      return http.Response(
        jsonEncode({
          'redirect_browser_to': 'https://accounts.google.com/o/oauth2/auth?x=1'
        }),
        200,
      );
    });
    final client = KratosClient(baseUrl: baseUrl, http: fake);
    final redirect = await client.submitOidc(flowId: 'flow-123');
    expect(redirect, 'https://accounts.google.com/o/oauth2/auth?x=1');
  });

  test('submitOidc throws when redirect_browser_to is missing', () async {
    final fake = MockClient(
        (_) async => http.Response(jsonEncode({'redirect_to': 'x'}), 200));
    final client = KratosClient(baseUrl: baseUrl, http: fake);
    expect(() => client.submitOidc(flowId: 'flow-123'),
        throwsA(isA<KratosException>()));
  });

  test('submitOidc throws on non-2xx', () async {
    final fake = MockClient((_) async => http.Response('{"error":true}', 400));
    final client = KratosClient(baseUrl: baseUrl, http: fake);
    expect(() => client.submitOidc(flowId: 'flow-123'),
        throwsA(isA<KratosException>()));
  });

  test('tokenExchange exchanges the code for a session token', () async {
    final fake = MockClient((request) async {
      expect(request.method, 'GET');
      expect(request.url.path, '/sessions/token-exchange');
      expect(request.url.queryParameters['init_code'], 'exchange-code-1');
      expect(request.url.queryParameters['return_to_code'], '');
      return http.Response(
          jsonEncode({'session_token': 'raw-session-token'}), 200);
    });
    final client = KratosClient(baseUrl: baseUrl, http: fake);
    final sessionToken = await client.tokenExchange(code: 'exchange-code-1');
    expect(sessionToken, 'raw-session-token');
  });

  test('tokenExchange throws when session_token is missing', () async {
    final fake =
        MockClient((_) async => http.Response(jsonEncode({'code': 'c'}), 200));
    final client = KratosClient(baseUrl: baseUrl, http: fake);
    expect(() => client.tokenExchange(code: 'exchange-code-1'),
        throwsA(isA<KratosException>()));
  });

  test('tokenExchange throws on non-2xx', () async {
    final fake = MockClient((_) async => http.Response('{"error":true}', 401));
    final client = KratosClient(baseUrl: baseUrl, http: fake);
    expect(() => client.tokenExchange(code: 'exchange-code-1'),
        throwsA(isA<KratosException>()));
  });

  test('whoami with tokenize_as returns session token', () async {
    final fake = MockClient((request) async {
      expect(request.method, 'GET');
      expect(
          request.url.toString(), '$baseUrl/sessions/whoami?tokenize_as=api');
      expect(request.headers['Authorization'], 'Bearer sess-token');
      return http.Response(jsonEncode({'jwt': 'tokenized.jwt.payload'}), 200);
    });
    final client = KratosClient(baseUrl: baseUrl, http: fake);
    final token = await client.tokenize(sessionToken: 'sess-token');
    expect(token, 'tokenized.jwt.payload');
  });

  test('tokenize throws when jwt is missing', () async {
    final fake = MockClient(
        (_) async => http.Response(jsonEncode({'active': true}), 200));
    final client = KratosClient(baseUrl: baseUrl, http: fake);
    expect(() => client.tokenize(sessionToken: 'sess-token'),
        throwsA(isA<KratosException>()));
  });

  test('tokenize throws on non-2xx', () async {
    final fake = MockClient((_) async => http.Response('{"error":true}', 401));
    final client = KratosClient(baseUrl: baseUrl, http: fake);
    expect(() => client.tokenize(sessionToken: 'sess-token'),
        throwsA(isA<KratosException>()));
  });

  test('signOut performs native logout on the current session', () async {
    final fake = MockClient((request) async {
      expect(request.method, 'DELETE');
      expect(request.url.toString(), '$baseUrl/self-service/logout/api');
      expect(request.headers['Authorization'], 'Bearer sess-token');
      return http.Response('', 204);
    });
    final client = KratosClient(baseUrl: baseUrl, http: fake);
    await client.signOut(sessionToken: 'sess-token');
  });

  test('signOut throws on non-2xx', () async {
    final fake = MockClient((_) async => http.Response('', 500));
    final client = KratosClient(baseUrl: baseUrl, http: fake);
    expect(() => client.signOut(sessionToken: 'sess-token'),
        throwsA(isA<KratosException>()));
  });
}
