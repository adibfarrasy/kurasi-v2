import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kurasi/core/auth/auth_service.dart';
import 'package:kurasi/core/auth/auth_state.dart';
import 'package:kurasi/features/auth/login_screen.dart';

class _FakeAuth implements AuthService {
  bool signedIn = false;
  @override
  Future<AuthUser?> signInWithGoogle() async { signedIn = true; return null; }
  @override
  Future<void> signOut() async {}
  @override
  Stream<AuthUser?> authChanges() async* {}
  @override
  Future<String?> currentIdToken() async => null;
}

void main() {
  testWidgets('google button calls signIn', (tester) async {
    final fake = _FakeAuth();
    await tester.pumpWidget(ProviderScope(
      overrides: [authServiceProvider.overrideWithValue(fake)],
      child: const MaterialApp(home: LoginScreen()),
    ));
    await tester.tap(find.text('Google'));
    await tester.pumpAndSettle();
    expect(fake.signedIn, isTrue);
  });
}