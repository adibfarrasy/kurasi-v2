import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:kurasi/app/app.dart';

void main() {
  test('router has expected top-level paths', () {
    final container = ProviderContainer();
    addTearDown(container.dispose);
    final router = container.read(routerProvider);
    final paths = <String>[];

    void collect(List<RouteBase> routes) {
      for (final route in routes) {
        if (route is GoRoute) {
          paths.add(route.path);
        } else if (route is StatefulShellRoute) {
          for (final branch in route.branches) {
            collect(branch.routes);
          }
        }
      }
    }

    collect(router.configuration.routes);
    expect(paths, isNotEmpty);
    expect(
      paths,
      containsAll(['/login', '/onboarding-1', '/myfit', '/tryon', '/wardrobe']),
    );
  });
}