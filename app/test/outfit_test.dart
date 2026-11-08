import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kurasi/core/api/api_client.dart';
import 'package:kurasi/core/api/api_providers.dart';
import 'package:kurasi/core/api/endpoints.dart';
import 'package:kurasi/core/auth/auth_service.dart';
import 'package:kurasi/core/auth/auth_state.dart';
import 'package:kurasi/features/onboarding/signature_state.dart';
import 'package:kurasi/features/outfit/outfit_detail_screen.dart';
import 'package:kurasi/features/outfit/outfit_edit_screen.dart';
import 'package:shared_preferences/shared_preferences.dart';

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

  String? lastPostPath;
  Map<String, dynamic>? lastPostBody;

  @override
  Future<dynamic> get(String path, {Map<String, dynamic>? query}) async {
    switch (path) {
      case ApiEndpoints.outfits:
        return [
          {
            'id': 'o1',
            'name': 'Night Look',
            'heroImageUrl': 'https://fit/he.png',
            'headwearId': null,
            'baseId': 'w1',
            'outerId': 'w2',
            'bottomId': null,
            'footwearId': null,
          },
        ];
      case ApiEndpoints.wardrobeItems:
        return [
          {
            'id': 'w1',
            'name': 'Black Hoodie',
            'category': 'shirt',
            'imageUrl': 'https://x/w1.png',
            'owned': true,
            'status': 'active',
            'colors': [
              {'name': 'black', 'hex': '#000000', 'ratio': 1.0},
            ],
          },
          {
            'id': 'w2',
            'name': 'Denim Jacket',
            'category': 'jacket',
            'imageUrl': 'https://x/w2.png',
            'owned': false,
            'status': 'active',
            'colors': [
              {'name': 'blue', 'hex': '#1E6FBA', 'ratio': 1.0},
            ],
          },
        ];
      default:
        return <String, dynamic>{};
    }
  }

  @override
  Future<dynamic> post(String path, {Object? body}) async {
    lastPostPath = path;
    lastPostBody = body is Map ? Map<String, dynamic>.from(body) : null;
    return <String, dynamic>{};
  }
}

List<Override> _overrides(_FakeApi api) => [
      apiClientProvider.overrideWithValue(api),
      authServiceProvider.overrideWithValue(_FakeAuth()),
      signaturePathsProvider.overrideWith((ref) => <String>[]),
    ];

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  testWidgets('detail renders hero carousel and slot names', (tester) async {
    final container = ProviderContainer(overrides: _overrides(_FakeApi()));
    addTearDown(container.dispose);

    await tester.pumpWidget(UncontrolledProviderScope(
      container: container,
      child: const MaterialApp(home: OutfitDetailScreen(id: 'o1')),
    ));
    await tester.pumpAndSettle();

    expect(find.byType(PageView), findsOneWidget);
    expect(find.text('Night Look'), findsOneWidget);
    expect(find.text('SHIRT'), findsOneWidget);
    expect(find.text('JACKET'), findsOneWidget);
  });

  testWidgets('edit screen exposes aspect ratio selector and share button',
      (tester) async {
    final container = ProviderContainer(overrides: _overrides(_FakeApi()));
    addTearDown(container.dispose);

    await tester.pumpWidget(UncontrolledProviderScope(
      container: container,
      child: const MaterialApp(home: OutfitEditScreen(id: 'o1')),
    ));
    await tester.pumpAndSettle();

    expect(find.byKey(const ValueKey('edit_share')), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('edit_tool_Canvas')));
    await tester.pumpAndSettle();
    expect(find.text('9:16'), findsOneWidget);
    expect(find.text('4:5'), findsOneWidget);
    expect(find.text('3:4'), findsOneWidget);
    expect(find.text('1:1'), findsOneWidget);
  });
}