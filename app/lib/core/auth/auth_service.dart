import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
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
/// Sign-in runs the Kratos **API** login flow: it starts a login flow, submits
/// the Google OIDC strategy, opens the returned `redirect_browser_to` in a web
/// view, exchanges the resulting `code` for a session token, tokenizes that
/// into an API JWT, and persists the JWT so API calls can authenticate against
/// the backend's Kratos verifier. The JWT lives 10m, so it is transparently
/// re-tokenized from the held session token as it approaches expiry.
class AuthService {
  AuthService(
      {required KratosClient kratos, required FlutterSecureStorage storage})
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

  /// Returns a non-expired tokenized JWT, transparently re-tokenizing from the
  /// held session token when the stored JWT is at/after expiry. Null when signed
  /// out or the session token can no longer be tokenized.
  Future<String?> currentIdToken() async {
    final jwt = await _storage.read(key: _jwtKey);
    if (jwt == null) return null;
    if (isJwtExpired(jwt)) return refreshTokenIfNeeded();
    return jwt;
  }

  /// Re-tokenizes the held session token into a fresh JWT and stores it.
  ///
  /// Returns the fresh JWT, or null when there is no held session token or
  /// Kratos can no longer tokenize it (revoked/expired session).
  Future<String?> refreshTokenIfNeeded() async {
    final sessionToken = await _storage.read(key: _sessionKey);
    if (sessionToken == null) return null;
    try {
      final jwt = await _kratos.tokenize(sessionToken: sessionToken);
      await _storage.write(key: _jwtKey, value: jwt);
      return jwt;
    } on KratosException {
      return null;
    }
  }

  /// Runs the Kratos API login flow and persists the resulting JWT.
  ///
  /// 1. Start `self-service/login/api` (accept JSON) and read the flow id.
  /// 2. Submit the Google OIDC strategy → Kratos answers with a
  ///    `redirect_browser_to` to open in the web view.
  /// 3. The web view returns the final callback URL, which carries a `code`
  ///    (the session-token exchange code).
  /// 4. Exchange the code for a session token, then tokenize it into a JWT.
  Future<AuthUser?> signInWithGoogle() async {
    final flowId = await _kratos.getLoginFlow();
    final redirectUrl = await _kratos.submitOidc(flowId: flowId);
    final callbackUrl = await FlutterWebAuth2.authenticate(
      url: redirectUrl,
      callbackUrlScheme: 'kurasi',
    );
    final code = extractCode(callbackUrl);
    if (code == null) {
      throw KratosException(
        'No exchange code in the OIDC callback URL ($callbackUrl).',
      );
    }
    final sessionToken = await _kratos.tokenExchange(code: code);
    final jwt = await _kratos.tokenize(sessionToken: sessionToken);
    await _storage.write(key: _sessionKey, value: sessionToken);
    await _storage.write(key: _jwtKey, value: jwt);
    final user = userFromJwt(jwt);
    _emit(user);
    return user;
  }

  /// Adopts an existing Kratos session token (debug-only dev login, where the
  /// token comes from `just dev-user` instead of the Google flow). Static so
  /// test fakes implementing [AuthService] need not stub it.
  static Future<void> adoptSessionToken({
    required KratosClient kratos,
    required FlutterSecureStorage storage,
    required String sessionToken,
  }) async {
    final jwt = await kratos.tokenize(sessionToken: sessionToken);
    await storage.write(key: _sessionKey, value: sessionToken);
    await storage.write(key: _jwtKey, value: jwt);
  }

  /// Revokes the Kratos session and clears persisted credentials.
  ///
  /// Best-effort: revocation runs against a live Kratos but storage is cleared
  /// and the stream emits null even when Kratos is unreachable.
  Future<void> signOut() async {
    final sessionToken = await _storage.read(key: _sessionKey);
    if (sessionToken != null) {
      try {
        await _kratos.signOut(sessionToken: sessionToken);
      } catch (_) {
        // Best-effort: clearing local credentials still signs the app out.
      }
    }
    await _clearCredentials();
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
    if (isJwtExpired(jwt)) {
      await _clearCredentials();
      _emit(null);
      return;
    }
    final user = userFromJwt(jwt);
    if (user == null) {
      await _clearCredentials();
      _emit(null);
      return;
    }
    _emit(user);
  }

  Future<void> _clearCredentials() async {
    await _storage.delete(key: _jwtKey);
    await _storage.delete(key: _sessionKey);
  }

  void _emit(AuthUser? user) {
    if (!_controller.isClosed) _controller.add(user);
  }

  /// Extracts the session-token exchange `code` from the OIDC callback URL.
  ///
  /// Checks the query string first, then the fragment, looking for `code` (the
  /// Kratos session-token exchange code) with legacy token params as fallback.
  @visibleForTesting
  String? extractCode(String redirectUrl) {
    final uri = Uri.parse(redirectUrl);
    final fragment = uri.fragment.isEmpty
        ? const <String, String>{}
        : Uri.splitQueryString(uri.fragment);
    for (final params in [uri.queryParameters, fragment]) {
      for (final key in [
        'code',
        'kratos_session_token',
        'session_token',
        'access_token',
        'session'
      ]) {
        final value = params[key];
        if (value != null && value.isNotEmpty) return value;
      }
    }
    return null;
  }

  /// Decodes the tokenized JWT payload into an [AuthUser].
  ///
  /// `id` is the Kratos identity id (the `sub` claim).
  @visibleForTesting
  AuthUser? userFromJwt(String jwt) {
    final payload = _decodePayload(jwt);
    if (payload == null) return null;
    final sub = payload['sub'] as String?;
    if (sub == null || sub.isEmpty) return null;
    return AuthUser(
      id: sub,
      email: payload['email'] as String? ?? '',
      name: payload['name'] as String?,
      photoUrl: payload['picture'] as String?,
    );
  }

  /// True when the JWT payload carries an `exp` that is at/after [now].
  ///
  /// Undecodable JWTs count as expired.
  @visibleForTesting
  bool isJwtExpired(String jwt, {DateTime? now}) {
    final payload = _decodePayload(jwt);
    if (payload == null) return true;
    final exp = payload['exp'];
    if (exp is! num) return true;
    final nowSec =
        ((now ?? DateTime.now()).millisecondsSinceEpoch / 1000).floor();
    return nowSec >= exp.toInt();
  }

  Map<String, dynamic>? _decodePayload(String jwt) {
    final parts = jwt.split('.');
    if (parts.length != 3) return null;
    try {
      return jsonDecode(
        utf8.decode(base64Url.decode(base64Url.normalize(parts[1]))),
      ) as Map<String, dynamic>;
    } catch (_) {
      return null;
    }
  }
}
