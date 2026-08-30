import 'dart:async';
import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_web_auth_2/flutter_web_auth_2.dart';

import 'kratos_client.dart';

class AuthUser {
  AuthUser({required this.id, required this.email, this.name, this.photoUrl});
  final String id;
  final String email;
  final String? name;
  final String? photoUrl;
}

/// App-facing auth facade backed by Ory Kratos.
///
/// Sign-in runs the Kratos browser login flow in a web view, exchanges the
/// returned session for a tokenized JWT, and persists that JWT so API calls can
/// authenticate against the backend's Kratos verifier.
class AuthService {
  AuthService({required KratosClient kratos, required FlutterSecureStorage storage})
      : _kratos = kratos,
        _storage = storage,
        _controller = StreamController<AuthUser?>.broadcast();

  final KratosClient _kratos;
  final FlutterSecureStorage _storage;
  final StreamController<AuthUser?> _controller;

  static const _sessionKey = 'kratos_session_token';
  static const _jwtKey = 'kratos_jwt';

  bool _hydrated = false;

  /// Stream of auth state changes, seeded with the persisted session on first
  /// listen.
  Stream<AuthUser?> authChanges() {
    _hydrate();
    return _controller.stream;
  }

  /// Returns the persisted tokenized JWT, or null when signed out.
  Future<String?> currentIdToken() => _storage.read(key: _jwtKey);

  /// Runs the Kratos browser login flow and persists the resulting JWT.
  ///
  /// The flow redirects back to `kurasi://callback`; the redirect URL carries
  /// the session token. When the session token is not present in the redirect
  /// (the browser flow left it in a Kratos-hosted cookie instead), the
  /// implementation falls back to re-running whoami with the session cookie —
  /// not exerciseable without a live Kratos instance, so the token path is the
  /// supported one and the cookie path throws with a descriptive error.
  Future<AuthUser?> signInWithGoogle() async {
    final redirectUrl = await FlutterWebAuth2.authenticate(
      url: '${_kratos.baseUrl}/self-service/login/browser?return_to=kurasi://callback',
      callbackUrlScheme: 'kurasi',
    );
    final sessionToken = _extractSessionToken(redirectUrl);
    if (sessionToken == null) {
      throw KratosException(
        'No session token in the OIDC redirect. If the browser flow returned '
        'a cookie instead, re-run whoami with that cookie against a live '
        'Kratos instance; the cookie path is not implemented in this build.',
      );
    }
    final jwt = await _kratos.tokenize(sessionToken: sessionToken);
    await _storage.write(key: _sessionKey, value: sessionToken);
    await _storage.write(key: _jwtKey, value: jwt);
    final user = _userFromJwt(jwt);
    _emit(user);
    return user;
  }

  /// Revokes the Kratos session and clears persisted credentials.
  Future<void> signOut() async {
    final sessionToken = await _storage.read(key: _sessionKey);
    if (sessionToken != null) {
      try {
        await _kratos.signOut(sessionToken: sessionToken);
      } on KratosException {
        // Best-effort: clearing local credentials still signs the app out.
      }
    }
    await _storage.delete(key: _sessionKey);
    await _storage.delete(key: _jwtKey);
    _emit(null);
  }

  Future<void> _hydrate() async {
    if (_hydrated) return;
    _hydrated = true;
    final jwt = await _storage.read(key: _jwtKey);
    if (jwt == null) {
      _emit(null);
      return;
    }
    final user = _userFromJwt(jwt);
    if (user == null) {
      await _storage.delete(key: _jwtKey);
      await _storage.delete(key: _sessionKey);
      _emit(null);
      return;
    }
    _emit(user);
  }

  void _emit(AuthUser? user) {
    if (!_controller.isClosed) _controller.add(user);
  }

  /// Extracts a session token from the OIDC redirect URL.
  ///
  /// Checks the fragment first (OAuth-style `access_token`/`session`), then the
  /// query string (Kratos-style `kratos_session_token`/`session_token`).
  String? _extractSessionToken(String redirectUrl) {
    final uri = Uri.parse(redirectUrl);
    final fragment = uri.fragment.isEmpty
        ? const <String, String>{}
        : Uri.splitQueryString(uri.fragment);
    for (final params in [fragment, uri.queryParameters]) {
      for (final key in ['kratos_session_token', 'session_token', 'access_token', 'session']) {
        final value = params[key];
        if (value != null && value.isNotEmpty) return value;
      }
    }
    return null;
  }

  /// Decodes the tokenized JWT payload into an [AuthUser].
  ///
  /// `id` is the Kratos identity id (the `sub` claim).
  AuthUser? _userFromJwt(String jwt) {
    final parts = jwt.split('.');
    if (parts.length != 3) return null;
    try {
      final payload =
          jsonDecode(utf8.decode(base64Url.decode(base64Url.normalize(parts[1])))) as Map<String, dynamic>;
      final sub = payload['sub'] as String?;
      if (sub == null || sub.isEmpty) return null;
      return AuthUser(
        id: sub,
        email: payload['email'] as String? ?? '',
        name: payload['name'] as String?,
        photoUrl: payload['picture'] as String?,
      );
    } catch (_) {
      return null;
    }
  }
}