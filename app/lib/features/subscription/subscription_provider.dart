import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api/api_providers.dart';
import '../../core/api/endpoints.dart';

final subscriptionProvider =
    AsyncNotifierProvider<SubscriptionNotifier, Map<String, dynamic>>(
  SubscriptionNotifier.new,
);

class SubscriptionNotifier extends AsyncNotifier<Map<String, dynamic>> {
  @override
  Future<Map<String, dynamic>> build() async {
    final api = ref.watch(apiClientProvider);
    final body =
        await api.get(ApiEndpoints.subscription) as Map<String, dynamic>;
    return body;
  }

  Future<void> refresh() async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(() => build());
  }

  Map<String, dynamic>? get subscription =>
      state.value?['subscription'] as Map<String, dynamic>?;

  String? get status => subscription?['status'] as String?;

  bool get isInTrial => (state.value?['isInTrial'] as bool?) ?? false;

  bool get isCurrent => (state.value?['isCurrent'] as bool?) ?? false;

  bool get hasAccess => (state.value?['hasAccess'] as bool?) ?? false;
}