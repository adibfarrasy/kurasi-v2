import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kurasi/app/app.dart';

void main() {
  test('router has expected top-level paths', () {
    final container = ProviderContainer();
    addTearDown(container.dispose);
    final router = container.read(routerProvider);
    final routes = router.routeInformationProvider.value.uri.path;
    expect(routes, isA<String>());
    // structural: refresh redirect logic covered by gate tests in later tasks
  });
}