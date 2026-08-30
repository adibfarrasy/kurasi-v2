import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api/api_providers.dart';
import '../../core/api/endpoints.dart';
import '../../core/auth/auth_state.dart';

final outfitsProvider =
    AsyncNotifierProvider<OutfitsNotifier, List<dynamic>>(OutfitsNotifier.new);

class OutfitsNotifier extends AsyncNotifier<List<dynamic>> {
  @override
  Future<List<dynamic>> build() async {
    ref.watch(authStateProvider);
    final api = ref.watch(apiClientProvider);
    final body = await api.get(ApiEndpoints.outfits);
    return (body as List).cast<dynamic>();
  }
}

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