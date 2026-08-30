import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:kurasi/app/app.dart';
import 'package:kurasi/core/auth/auth_service.dart';
import 'package:kurasi/core/auth/auth_state.dart';
import 'package:kurasi/features/auth/login_screen.dart';
import 'package:kurasi/features/myfit/myfit_screen.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _FakeAuth implements AuthService {
  _FakeAuth(this._user);
  AuthUser? _user;
  @override
  Future<AuthUser?> signInWithGoogle() async {
    _user = AuthUser(id: 'u1', email: 'a@b.c');
    return _user;
  }

  @override
  Future<void> signOut() async => _user = null;
  @override
  Stream<AuthUser?> authChanges() async* {
    yield _user;
  }

  @override
  Future<String?> currentIdToken() async => null;
  @override
  Future<String?> refreshTokenIfNeeded() async => null;
  @override
  String? extractCode(String redirectUrl) => null;
  @override
  AuthUser? userFromJwt(String jwt) => null;
  @override
  bool isJwtExpired(String jwt, {DateTime? now}) => false;
}

Future<void> _pumpApp(WidgetTester tester, _FakeAuth fake) async {
  await tester.pumpWidget(ProviderScope(
    overrides: [authServiceProvider.overrideWithValue(fake)],
    child: const KurasiApp(),
  ));
  await tester.pumpAndSettle();
}

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({'onboarding_complete': true});
  });

  testWidgets('cold_start_signed_in_redirects_to_myfit', (tester) async {
    final fake = _FakeAuth(AuthUser(id: 'u1', email: 'a@b.c'));
    await _pumpApp(tester, fake);
    expect(find.byType(MyFitScreen), findsOneWidget);
    expect(
        GoRouter.of(tester.element(find.byType(MyFitScreen)))
            .state
            .matchedLocation,
        '/myfit');
  });

  testWidgets('sign_in_tap_redirects', (tester) async {
    final fake = _FakeAuth(null);
    await _pumpApp(tester, fake);
    expect(find.byType(LoginScreen), findsOneWidget);

    await tester.tap(find.text('Google'));
    await tester.pumpAndSettle();

    expect(find.byType(MyFitScreen), findsOneWidget);
    expect(
        GoRouter.of(tester.element(find.byType(MyFitScreen)))
            .state
            .matchedLocation,
        '/myfit');
  });

  testWidgets('sign_out_redirects_to_login', (tester) async {
    final fake = _FakeAuth(AuthUser(id: 'u1', email: 'a@b.c'));
    await _pumpApp(tester, fake);
    expect(find.byType(MyFitScreen), findsOneWidget);

    final element = tester.element(find.byType(KurasiApp));
    final container = ProviderScope.containerOf(element);
    await container.read(authStateProvider.notifier).signOut();
    await tester.pumpAndSettle();

    expect(find.byType(LoginScreen), findsOneWidget);
    expect(
        GoRouter.of(tester.element(find.byType(LoginScreen)))
            .state
            .matchedLocation,
        '/login');
  });
}
