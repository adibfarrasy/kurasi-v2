import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kurasi/core/api/api_client.dart';
import 'package:kurasi/core/api/api_providers.dart';
import 'package:kurasi/core/api/endpoints.dart';
import 'package:kurasi/core/auth/auth_service.dart';
import 'package:kurasi/core/auth/auth_state.dart';
import 'package:kurasi/features/wardrobe/wardrobe_screen.dart';

class _FakeAuth implements AuthService {
  @override
  Future<AuthUser?> signInWithGoogle() async => null;
  @override
  Future<void> signOut() async {}
  @override
  Stream<AuthUser?> authChanges() async* {
    yield null;
  }

  @override
  Future<String?> currentIdToken() async => null;
  @override
  Future<String?> refreshTokenIfNeeded() async => null;
  @override
  String? extractCode(String redirectUrl) => null;
  @override
  AuthUser? userFromJwt(String jwt) => null;
  @override
  bool isJwtExpired(String jwt, {DateTime? now}) => false;
}

class _FakeApi extends ApiClient {
  _FakeApi() : super(Dio());

  @override
  Future<dynamic> get(String path, {Map<String, dynamic>? query}) async {
    switch (path) {
      case ApiEndpoints.wardrobeItems:
        return [
          {
            'id': 'w1',
            'name': 'Black Hoodie',
            'brand': 'Nike',
            'category': 'shirt',
            'colors': [
              {'name': 'black', 'hex': '#000000', 'ratio': 1.0},
            ],
            'owned': true,
            'status': 'active',
          },
          {
            'id': 'w2',
            'name': 'White Tee',
            'brand': 'Adidas',
            'category': 'shirt',
            'colors': [
              {'name': 'white', 'hex': '#FFFFFF', 'ratio': 1.0},
            ],
            'owned': true,
            'status': 'active',
          },
          {
            'id': 'w3',
            'name': 'Denim Jacket',
            'brand': "Levi's",
            'category': 'jacket',
            'colors': [
              {'name': 'blue', 'hex': '#1E6FBA', 'ratio': 1.0},
            ],
            'owned': true,
            'status': 'active',
          },
          {
            'id': 'w4',
            'name': 'Borrowed Coat',
            'brand': 'Zara',
            'category': 'jacket',
            'colors': [
              {'name': 'black', 'hex': '#000000', 'ratio': 1.0},
            ],
            'owned': false,
            'status': 'active',
          },
        ];
      default:
        return <String, dynamic>{};
    }
  }
}

Future<void> _pump(WidgetTester tester) async {
  await tester.pumpWidget(ProviderScope(
    overrides: [
      apiClientProvider.overrideWithValue(_FakeApi()),
      authServiceProvider.overrideWithValue(_FakeAuth()),
    ],
    child: const MaterialApp(home: WardrobeScreen()),
  ));
  await tester.pumpAndSettle();
}

Future<void> _toList(WidgetTester tester) async {
  await tester.tap(find.byKey(const Key('wardrobe_mode_list')));
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('wardrobe list shows owned active items', (tester) async {
    await _pump(tester);
    await _toList(tester);
    expect(find.text('Black Hoodie'), findsOneWidget);
    expect(find.text('White Tee'), findsOneWidget);
    expect(find.text('Denim Jacket'), findsOneWidget);
    expect(find.text('Borrowed Coat'), findsNothing);
  });

  testWidgets('wardrobe search filters items to prefix matches', (tester) async {
    await _pump(tester);
    await _toList(tester);
    await tester.tap(find.byKey(const Key('wardrobe_search_toggle')));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('wardrobe_search')), 'blac');
    await tester.pump();
    expect(find.text('Black Hoodie', findRichText: true), findsOneWidget);
    expect(find.text('White Tee', findRichText: true), findsNothing);
    expect(find.text('Denim Jacket', findRichText: true), findsNothing);
  });

  testWidgets('wardrobe mode toggle switches pager to list', (tester) async {
    await _pump(tester);
    expect(find.byType(PageView), findsOneWidget);
    await _toList(tester);
    expect(find.byType(PageView), findsNothing);
    expect(find.byType(ListView), findsOneWidget);
  });

  testWidgets('wardrobe category filter sheet filters items', (tester) async {
    await _pump(tester);
    await _toList(tester);
    await tester.tap(find.byKey(const Key('wardrobe_sort')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('filter_chip_jacket')));
    await tester.pump();
    await tester.tap(find.byKey(const Key('filter_done')));
    await tester.pumpAndSettle();

    expect(find.text('Denim Jacket'), findsOneWidget);
    expect(find.text('Black Hoodie'), findsNothing);
  });
}
