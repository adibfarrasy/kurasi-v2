import 'dart:convert';

import 'package:http/http.dart' as http;

/// Thin HTTP wrapper for the Kratos public API.
///
/// Talks to the session and login endpoints exposed by Ory Kratos so the app
/// can drive the API login flow (OIDC with Google), exchange the resulting
/// session-token code for a raw session token, tokenize it into an API JWT, and
/// revoke sessions on sign-out.
class KratosClient {
  KratosClient({required this.baseUrl, http.Client? http})
      : _http = http ?? _defaultClient();

  static http.Client _defaultClient() => http.Client();

  final String baseUrl;
  final http.Client _http;

  /// Starts the API login flow and returns its flow id.
  ///
  /// `return_session_token_exchange_code=true` makes the OIDC submit return a
  /// `redirect_browser_to` that eventually redirects back to the app with a
  /// `code` that can be exchanged for a session token.
  Future<String> getLoginFlow() async {
    final uri = Uri.parse('$baseUrl/self-service/login/api').replace(
      queryParameters: const {
        'return_session_token_exchange_code': 'true',
        'return_to': 'kurasi://callback',
      },
    );
    final response =
        await _http.get(uri, headers: {'Accept': 'application/json'});
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw KratosException(
          'login flow fetch failed: HTTP ${response.statusCode}');
    }
    final body = jsonDecode(response.body) as Map<String, dynamic>;
    final id = body['id'] as String?;
    if (id == null || id.isEmpty) {
      throw KratosException('login flow response missing id');
    }
    return id;
  }

  /// Submits the OIDC strategy on the login flow and returns the browser
  /// redirect URL to open in the web view.
  Future<String> submitOidc({required String flowId}) async {
    final response = await _http.post(
      Uri.parse('$baseUrl/self-service/login/strategies/oidc'),
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: jsonEncode({'flow': flowId, 'provider': 'google'}),
    );
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw KratosException('oidc submit failed: HTTP ${response.statusCode}');
    }
    final body = jsonDecode(response.body) as Map<String, dynamic>;
    final redirect = body['redirect_browser_to'] as String?;
    if (redirect == null || redirect.isEmpty) {
      throw KratosException('oidc submit response missing redirect_browser_to');
    }
    return redirect;
  }

  /// Exchanges a session-token exchange `code` for a raw session token.
  Future<String> tokenExchange({required String code}) async {
    final uri = Uri.parse('$baseUrl/sessions/token-exchange').replace(
      queryParameters: {'init_code': code, 'return_to_code': ''},
    );
    final response = await _http.get(uri);
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw KratosException(
          'token exchange failed: HTTP ${response.statusCode}');
    }
    final body = jsonDecode(response.body) as Map<String, dynamic>;
    final sessionToken = body['session_token'] as String?;
    if (sessionToken == null || sessionToken.isEmpty) {
      throw KratosException('token exchange response missing session_token');
    }
    return sessionToken;
  }

  /// Exchanges a raw session token for a tokenized session JWT.
  ///
  /// GET `$baseUrl/sessions/whoami?tokenize_as=api` authenticated with the
  /// session token as a bearer credential. Returns the `jwt` from the body.
  Future<String> tokenize({required String sessionToken}) async {
    final response = await _http.get(
      Uri.parse('$baseUrl/sessions/whoami?tokenize_as=api'),
      headers: {'Authorization': 'Bearer $sessionToken'},
    );
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw KratosException(
          'whoami tokenize failed: HTTP ${response.statusCode}');
    }
    final body = jsonDecode(response.body) as Map<String, dynamic>;
    final jwt = body['jwt'] as String?;
    if (jwt == null || jwt.isEmpty) {
      throw KratosException('whoami tokenize response missing jwt');
    }
    return jwt;
  }

  /// Revokes the session identified by [sessionToken].
  ///
  /// DELETE `$baseUrl/self-service/logout/api` (native logout) revokes the
  /// session identified by the bearer credential — the current session — rather
  /// than `DELETE /sessions` which would revoke other sessions.
  Future<void> signOut({required String sessionToken}) async {
    final response = await _http.delete(
      Uri.parse('$baseUrl/self-service/logout/api'),
      headers: {'Authorization': 'Bearer $sessionToken'},
    );
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw KratosException(
          'session revoke failed: HTTP ${response.statusCode}');
    }
  }
}

class KratosException implements Exception {
  KratosException(this.message);
  final String message;

  @override
  String toString() => 'KratosException: $message';
}
