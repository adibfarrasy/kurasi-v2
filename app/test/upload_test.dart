import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:kurasi/core/api/api_client.dart';
import 'package:kurasi/core/api/api_providers.dart';
import 'package:kurasi/core/api/endpoints.dart';
import 'package:kurasi/core/auth/auth_service.dart';
import 'package:kurasi/core/auth/auth_state.dart';
import 'package:kurasi/features/wardrobe/brands_provider.dart';
import 'package:kurasi/features/wardrobe/upload_review_screen.dart';

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

  final List<String> postPaths = [];
  final List<Map<String, dynamic>> postBodies = [];

  @override
  Future<dynamic> get(String path, {Map<String, dynamic>? query}) async {
    switch (path) {
      case ApiEndpoints.brands:
        return ['Nike', 'Zara'];
      case ApiEndpoints.wardrobeItems:
        return <dynamic>[];
      default:
        return <String, dynamic>{};
    }
  }

  @override
  Future<dynamic> post(String path, {Object? body}) async {
    postPaths.add(path);
    postBodies.add(body is Map ? Map<String, dynamic>.from(body) : {});
    return body;
  }
}

Map<String, dynamic> _processedItem() => {
      'title': 'Black Hoodie',
      'category': 'jacket',
      'fit': 'regular',
      'length': 'hip',
      'colors': [
        {'name': 'black', 'hex': '#000000', 'ratio': 1.0},
      ],
      'originalImageUrl': 'https://fit/original.png',
      'processedImageUrl': 'https://fit/processed.png',
    };

List<Override> _overrides(_FakeApi api) => [
      apiClientProvider.overrideWithValue(api),
      authServiceProvider.overrideWithValue(_FakeAuth()),
    ];

void main() {
  test('brands provider fetches the brand list', () async {
    final api = _FakeApi();
    final container = ProviderContainer(overrides: _overrides(api));
    addTearDown(container.dispose);

    await container.read(authStateProvider.future);
    final brands = await container.read(brandsProvider.future);
    expect(brands, ['Nike', 'Zara']);
  });

  testWidgets('review form shows the processed item name', (tester) async {
    final api = _FakeApi();
    final container = ProviderContainer(overrides: _overrides(api));
    addTearDown(container.dispose);

    await tester.pumpWidget(UncontrolledProviderScope(
      container: container,
      child: MaterialApp(
        home: UploadWardrobeReviewScreen(
          prefills: jsonEncode([_processedItem()]),
        ),
      ),
    ));
    await tester.pumpAndSettle();

    expect(find.text('Black Hoodie'), findsOneWidget);
  });

  testWidgets('save posts each item to /api/wardrobe/items and goes to wardrobe',
      (tester) async {
    final api = _FakeApi();
    final container = ProviderContainer(overrides: _overrides(api));
    addTearDown(container.dispose);

    final router = GoRouter(
      initialLocation: '/upload-wardrobe-review?prefills=${Uri.encodeQueryComponent(jsonEncode([_processedItem()]))}',
      routes: [
        GoRoute(
          path: '/upload-wardrobe-review',
          builder: (_, state) => UploadWardrobeReviewScreen(
            prefills: state.uri.queryParameters['prefills'],
          ),
        ),
        GoRoute(
          path: '/wardrobe',
          builder: (_, __) => const Scaffold(body: Text('wardrobe home')),
        ),
      ],
    );

    await tester.pumpWidget(UncontrolledProviderScope(
      container: container,
      child: MaterialApp.router(routerConfig: router),
    ));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const ValueKey('review_save')));
    await tester.pumpAndSettle();

    expect(api.postPaths, [ApiEndpoints.wardrobeItems]);
    expect(api.postBodies.single, {
      'imageUrl': 'https://fit/processed.png',
      'originalImageUrl': 'https://fit/original.png',
      'category': 'jacket',
      'name': 'Black Hoodie',
      'brand': null,
      'fit': 'regular',
      'length': 'hip',
      'customNotes': null,
      'colors': [
        {'name': 'black', 'hex': '#000000', 'ratio': 1.0},
      ],
    });
    expect(find.text('wardrobe home'), findsOneWidget);
  });
}