import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_providers.dart';
import '../../core/api/endpoints.dart';
import '../../core/auth/auth_state.dart';

final brandsProvider =
    AsyncNotifierProvider<BrandsNotifier, List<String>>(BrandsNotifier.new);

class BrandsNotifier extends AsyncNotifier<List<String>> {
  @override
  Future<List<String>> build() async {
    ref.watch(authStateProvider);
    final api = ref.watch(apiClientProvider);
    final body = await api.get(ApiEndpoints.brands);
    return (body as List).cast<String>();
  }
}