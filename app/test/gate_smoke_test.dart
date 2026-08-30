import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:kurasi/app/router.dart';
import 'package:kurasi/core/auth/auth_service.dart';
import 'package:kurasi/core/auth/auth_state.dart';

final testRouterProvider = Provider<GoRouter>((ref) => buildRouter(ref));

class StubAuthNotifier extends AuthStateNotifier {
  @override
  Future<AuthUser?> build() async => null;
}

void main() {
  late ProviderContainer container;
  late GoRouter router;

  setUp(() {
    container = ProviderContainer(overrides: [
      authStateProvider.overrideWith(StubAuthNotifier.new),
    ]);
    router = container.read(testRouterProvider);
  });

  tearDown(() => container.dispose());

  testWidgets('unauthenticated redirects to login', (tester) async {
    await tester.pumpWidget(MaterialApp.router(routerConfig: router));
    await tester.pumpAndSettle();
    expect(router.state.matchedLocation, '/login');
  });

  testWidgets('authed + not onboarded redirects to onboarding-1', (tester) async {
    container.read(authStateProvider.notifier);
    await tester.pump();
    container.read(authStateProvider.notifier).state = AsyncData(AuthUser(id: 'u1', email: 'a@b.co'));
    await tester.pumpWidget(MaterialApp.router(routerConfig: router));
    await tester.pumpAndSettle();
    expect(router.state.matchedLocation, '/onboarding-1');
  });

  testWidgets('authed + onboarded redirects to myfit', (tester) async {
    container.read(authStateProvider.notifier);
    await tester.pump();
    container.read(authStateProvider.notifier).state = AsyncData(AuthUser(id: 'u1', email: 'a@b.co'));
    container.read(onboardingCompleteProvider.notifier).set(true);
    await tester.pumpWidget(MaterialApp.router(routerConfig: router));
    await tester.pumpAndSettle();
    expect(router.state.matchedLocation, '/myfit');
  });
}