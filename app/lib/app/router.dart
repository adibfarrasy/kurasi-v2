import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../core/auth/auth_state.dart';
import '../features/auth/login_screen.dart';
import '../features/credits/ai_balance_screen.dart';
import '../features/onboarding/ai_credits_screen.dart';
import '../features/onboarding/capture_face_screen.dart';
import '../features/onboarding/membership_card_screen.dart';
import '../features/onboarding/onboarding_one_screen.dart';
import '../features/onboarding/onboarding_three_screen.dart';
import '../features/onboarding/onboarding_two_screen.dart';
import '../features/myfit/myfit_screen.dart';
import '../features/outfit/outfit_detail_screen.dart';
import '../features/outfit/outfit_edit_screen.dart';
import '../features/placeholder.dart';
import '../features/shell/tab_shell.dart';
import '../features/steal_the_look/analyzing_screen.dart';
import '../features/steal_the_look/failed_screen.dart';
import '../features/steal_the_look/guide_screen.dart';
import '../features/subscription/subscription_screen.dart';
import '../features/tryon/tryon_screen.dart';
import '../features/wardrobe/upload_guide_screen.dart';
import '../features/wardrobe/upload_processing_screen.dart';
import '../features/wardrobe/upload_review_screen.dart';
import '../features/wardrobe/wardrobe_screen.dart';

final onboardingCompleteProvider = NotifierProvider<OnboardingFlag, bool>(OnboardingFlag.new);

class OnboardingFlag extends Notifier<bool> {
  static const _prefsKey = 'onboarding_complete';

  @override
  bool build() {
    SharedPreferences.getInstance()
        .then((prefs) => state = prefs.getBool(_prefsKey) ?? false)
        .catchError((_) => false);
    return false;
  }

  void set(bool value) {
    state = value;
    SharedPreferences.getInstance()
        .then((prefs) => prefs.setBool(_prefsKey, value))
        .catchError((_) => false);
  }
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
        builder: (_, __, shell) => TabShell(child: shell),
        branches: [
          StatefulShellBranch(routes: [GoRoute(path: '/myfit', builder: (_, __) => const MyFitScreen())]),
          StatefulShellBranch(routes: [GoRoute(path: '/tryon', builder: (_, __) => const TryOnScreen())]),
          StatefulShellBranch(routes: [GoRoute(path: '/wardrobe', builder: (_, __) => const WardrobeScreen())]),
        ],
      ),
      GoRoute(
        path: '/steal-the-look',
        builder: (_, __) => const StealTheLookScreen(),
        routes: [
          GoRoute(
            path: 'analyzing',
            builder: (_, state) => StealTheLookAnalyzingScreen(
              uri: state.uri.queryParameters['uri'],
            ),
          ),
          GoRoute(
            path: 'failed',
            builder: (_, state) => StealTheLookFailedScreen(
              reason: state.uri.queryParameters['reason'],
              uri: state.uri.queryParameters['uri'],
            ),
          ),
        ],
      ),
      GoRoute(path: '/upload-wardrobe-guide', builder: (_, __) => const UploadWardrobeGuideScreen()),
      GoRoute(
        path: '/upload-wardrobe',
        builder: (_, state) =>
            UploadWardrobeScreen(uris: state.uri.queryParameters['uris']),
      ),
      GoRoute(
        path: '/upload-wardrobe-review',
        builder: (_, state) => UploadWardrobeReviewScreen(
          uris: state.uri.queryParameters['uris'],
          prefills: state.uri.queryParameters['prefills'],
        ),
      ),
      GoRoute(path: '/subscription', builder: (_, __) => const SubscriptionScreen()),
      GoRoute(path: '/ai-balance', builder: (_, __) => const AiBalanceScreen()),
      GoRoute(
        path: '/outfit/:id',
        builder: (_, state) => OutfitDetailScreen(id: state.pathParameters['id']!),
        routes: [
          GoRoute(path: 'edit', builder: (_, state) => OutfitEditScreen(id: state.pathParameters['id']!)),
        ],
      ),
      GoRoute(path: '/profile', builder: (_, __) => const ProfileScreen()),
    ],
  );
}