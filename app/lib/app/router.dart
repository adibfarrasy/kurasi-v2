import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../core/auth/auth_state.dart';
import '../features/auth/login_screen.dart';
import '../features/onboarding/capture_face_screen.dart';
import '../features/onboarding/onboarding_one_screen.dart';
import '../features/onboarding/onboarding_three_screen.dart';
import '../features/onboarding/onboarding_two_screen.dart';
import '../features/placeholder.dart';

final onboardingCompleteProvider = NotifierProvider<OnboardingFlag, bool>(OnboardingFlag.new);

class OnboardingFlag extends Notifier<bool> {
  @override
  bool build() => false; // hydrated from shared_preferences in a later task; default false
  void set(bool value) => state = value;
}

GoRouter buildRouter(Ref ref) {
  return GoRouter(
    initialLocation: '/login',
    redirect: (context, state) {
      final auth = ref.read(authStateProvider).value;
      final hasOnboarded = ref.read(onboardingCompleteProvider);
      final loc = state.matchedLocation;
      final onLogin = loc == '/login';
      final onOnboarding = loc.startsWith('/onboarding');
      if (auth == null) return onLogin ? null : '/login';
      if (onLogin) return hasOnboarded ? '/myfit' : '/onboarding-1';
      if (!hasOnboarded && !onOnboarding) return '/onboarding-1';
      if (hasOnboarded && onOnboarding) return '/myfit';
      return null;
    },
    routes: [
      GoRoute(path: '/login', builder: (_, __) => const LoginScreen()),
      GoRoute(path: '/onboarding-1', builder: (_, __) => const OnboardingOneScreen()),
      GoRoute(path: '/onboarding-2', builder: (_, __) => const OnboardingTwoScreen()),
      GoRoute(path: '/onboarding-3', builder: (_, __) => const OnboardingThreeScreen()),
      GoRoute(path: '/onboarding/capture-face', builder: (_, __) => const CaptureFaceScreen()),
      GoRoute(path: '/onboarding/membership-card', builder: (_, __) => const MembershipCardScreen()),
      GoRoute(path: '/onboarding/ai-credits', builder: (_, __) => const AiCreditsScreen()),
      StatefulShellRoute.indexedStack(
        builder: (_, __, shell) => shell,
        branches: [
          StatefulShellBranch(routes: [GoRoute(path: '/myfit', builder: (_, __) => const MyFitScreen())]),
          StatefulShellBranch(routes: [GoRoute(path: '/tryon', builder: (_, __) => const TryOnScreen())]),
          StatefulShellBranch(routes: [GoRoute(path: '/wardrobe', builder: (_, __) => const WardrobeScreen())]),
        ],
      ),
    ],
  );
}