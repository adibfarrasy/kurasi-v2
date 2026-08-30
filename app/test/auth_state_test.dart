import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kurasi/core/auth/auth_state.dart';
import 'package:kurasi/core/auth/auth_service.dart';

class _FakeAuthService implements AuthService {
  AuthUser? _user;
  _FakeAuthService(this._user);
  @override
  Future<AuthUser?> signInWithGoogle() async => _user;
  @override
  Future<void> signOut() async => _user = null;
  @override
  Stream<AuthUser?> authChanges() async* {
    yield _user;
  }
  @override
  Future<String?> currentIdToken() async => null;
  @override
  String? extractSessionToken(String redirectUrl) => null;
  @override
  AuthUser? userFromJwt(String jwt) => null;
}

void main() {
  test('signOut clears state', () async {
    final container = ProviderContainer(overrides: [
      authServiceProvider.overrideWithValue(_FakeAuthService(AuthUser(id: 'u1', email: 'a@b.c'))),
    ]);
    addTearDown(container.dispose);
    final notifier = container.read(authStateProvider.notifier);
    await container.read(authStateProvider.future);
    expect(container.read(authStateProvider).value?.id, 'u1');
    await notifier.signOut();
    expect(container.read(authStateProvider).value, isNull);
  });
}