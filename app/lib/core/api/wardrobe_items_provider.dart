import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../auth/auth_state.dart';
import 'api_providers.dart';
import 'endpoints.dart';

final wardrobeItemsProvider = AsyncNotifierProvider<WardrobeItemsNotifier, List<dynamic>>(
    WardrobeItemsNotifier.new);

class WardrobeItemsNotifier extends AsyncNotifier<List<dynamic>> {
  @override
  Future<List<dynamic>> build() async {
    ref.watch(authStateProvider);
    final api = ref.watch(apiClientProvider);
    final body = await api.get(ApiEndpoints.wardrobeItems);
    return (body as List).cast<dynamic>();
  }
}