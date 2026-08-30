import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api/api_providers.dart';
import '../../core/api/endpoints.dart';

final creditsProvider =
    AsyncNotifierProvider<CreditsNotifier, Map<String, dynamic>>(
  CreditsNotifier.new,
);

class CreditsNotifier extends AsyncNotifier<Map<String, dynamic>> {
  @override
  Future<Map<String, dynamic>> build() async {
    final api = ref.watch(apiClientProvider);
    final body = await api.get(ApiEndpoints.credits) as Map<String, dynamic>;
    return body;
  }

  Future<void> refresh() async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(() => build());
  }

  int get balance => (state.value?['balance'] as int?) ?? 0;
}