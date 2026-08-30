import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'auth_service.dart';

final authServiceProvider = Provider<AuthService>((ref) {
  throw UnimplementedError('authServiceProvider must be overridden in main');
});

final authStateProvider = AsyncNotifierProvider<AuthStateNotifier, AuthUser?>(AuthStateNotifier.new);

class AuthStateNotifier extends AsyncNotifier<AuthUser?> {
  @override
  Future<AuthUser?> build() async {
    final service = ref.watch(authServiceProvider);
    // hydrate current user synchronously, then subscribe
    ref.onDispose(service.authChanges().listen((u) => state = AsyncData(u)).cancel);
    return service.authChanges().first;
  }

  Future<void> signInWithGoogle() async {
    final user = await ref.read(authServiceProvider).signInWithGoogle();
    state = AsyncData(user);
  }

  Future<void> signOut() async {
    await ref.read(authServiceProvider).signOut();
    state = const AsyncData(null);
  }
}