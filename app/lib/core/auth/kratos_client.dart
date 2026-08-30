import 'dart:convert';

import 'package:http/http.dart' as http;

/// Thin HTTP wrapper for the Kratos public API.
///
/// Talks to the session endpoints exposed by Ory Kratos so the app can turn a
/// browser-flow session into an API JWT and revoke sessions on sign-out.
class KratosClient {
  KratosClient({required this.baseUrl, http.Client? http})
      : _http = http ?? _defaultClient();

  static http.Client _defaultClient() => http.Client();

  final String baseUrl;
  final http.Client _http;

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
      throw KratosException('whoami tokenize failed: HTTP ${response.statusCode}');
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
  /// DELETE `$baseUrl/sessions`.
  Future<void> signOut({required String sessionToken}) async {
    final response = await _http.delete(
      Uri.parse('$baseUrl/sessions'),
      headers: {'Authorization': 'Bearer $sessionToken'},
    );
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw KratosException('session revoke failed: HTTP ${response.statusCode}');
    }
  }
}

class KratosException implements Exception {
  KratosException(this.message);
  final String message;

  @override
  String toString() => 'KratosException: $message';
}