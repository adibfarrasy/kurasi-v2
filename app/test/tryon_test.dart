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
import 'package:kurasi/features/tryon/add_item_sheet.dart';
import 'package:kurasi/features/tryon/slot_strip.dart';
import 'package:kurasi/features/tryon/steal_the_look_draft.dart';
import 'package:kurasi/features/tryon/tone_background.dart';
import 'package:kurasi/features/tryon/tryon_screen.dart';
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
            'outerId': null,
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
        ];
      case ApiEndpoints.biometrics:
        return {'defaultAvatarUrl': 'https://x/avatar.png'};
      default:
        return <String, dynamic>{};
    }
  }

  @override
  Future<dynamic> post(String path, {Object? body}) async {
    lastPostPath = path;
    lastPostBody = body is Map ? Map<String, dynamic>.from(body) : null;
    if (path == ApiEndpoints.outfitsFromTryon) {
      return {'id': 'new', 'name': 'saved'};
    }
    return <String, dynamic>{};
  }
}

List<Override> _overrides(_FakeApi api) => [
      apiClientProvider.overrideWithValue(api),
      authServiceProvider.overrideWithValue(_FakeAuth()),
      stealTheLookDraftProvider.overrideWith((ref) => null),
    ];

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  test('outfitTone buckets warm and cool color names', () {
    expect(outfitTone(['red', 'orange']), 'warm');
    expect(outfitTone(['blue', 'green']), 'cool');
    expect(outfitTone(['blue', 'red']), 'neutral');
    expect(outfitTone([]), 'neutral');
  });

  test('colorSimilarity ranks identical and alternative colors', () {
    final black = [
      {'name': 'black', 'hex': '#000000', 'ratio': 1.0},
    ];
    final charcoal = [
      {'name': 'charcoal', 'hex': '#1a1a1a', 'ratio': 1.0},
    ];
    final gray = [
      {'name': 'gray', 'hex': '#4A4A4A', 'ratio': 1.0},
    ];
    final blue = [
      {'name': 'blue', 'hex': '#1E6FBA', 'ratio': 1.0},
    ];
    expect(colorSimilarity(black, black), greaterThanOrEqualTo(0.9));
    expect(colorSimilarity(black, charcoal), greaterThanOrEqualTo(0.9));
    expect(colorSimilarity(black, gray), greaterThanOrEqualTo(0.5));
    expect(colorSimilarity(black, blue), lessThan(0.5));
  });

  test('bucketItemsByColor splits identical, alternative and other buckets', () {
    final reference = [
      {'name': 'black', 'hex': '#000000', 'ratio': 1.0},
    ];
    final items = [
      {'id': 'a', 'colors': [{'name': 'black', 'hex': '#000000', 'ratio': 1.0}]},
      {'id': 'b', 'colors': [{'name': 'gray', 'hex': '#4A4A4A', 'ratio': 1.0}]},
      {'id': 'c', 'colors': [{'name': 'blue', 'hex': '#1E6FBA', 'ratio': 1.0}]},
    ];
    final buckets = bucketItemsByColor(items, reference);
    final labels = buckets.map((b) => b.label).toList();
    expect(labels, ['Same color', 'Alternatives', 'Other']);
    expect(buckets[0].items.single['id'], 'a');
    expect(buckets[1].items.single['id'], 'b');
    expect(buckets[2].items.single['id'], 'c');
  });

  testWidgets('slot strip shows 5 slot positions and add cards for empty slots',
      (tester) async {
    final container = ProviderContainer(overrides: _overrides(_FakeApi()));
    addTearDown(container.dispose);
    container
        .read(tryOnSlotsProvider.notifier)
        .setSlot('shirt', {'kind': 'wardrobe', 'category': 'shirt', 'itemId': 'w1'});

    await tester.pumpWidget(UncontrolledProviderScope(
      container: container,
      child: const MaterialApp(
        home: Scaffold(body: Center(child: SlotStrip())),
      ),
    ));
    await tester.pumpAndSettle();

    for (final category in ['headwear', 'shirt', 'jacket', 'pants', 'footwear']) {
      expect(find.byKey(ValueKey('slot_$category')), findsOneWidget);
    }
    expect(find.byKey(const ValueKey('add_slot_shirt')), findsNothing);
    expect(find.byKey(const ValueKey('add_slot_headwear')), findsOneWidget);
    expect(find.byKey(const ValueKey('add_slot_jacket')), findsOneWidget);
    expect(find.byKey(const ValueKey('add_slot_pants')), findsOneWidget);
    expect(find.byKey(const ValueKey('add_slot_footwear')), findsOneWidget);
  });

  testWidgets('slot strip shows changed dot and ai badge for ai slot',
      (tester) async {
    final container = ProviderContainer(overrides: _overrides(_FakeApi()));
    addTearDown(container.dispose);
    container.read(tryOnSlotsProvider.notifier).setSlot('jacket', {
      'kind': 'ai',
      'category': 'jacket',
      'aiItem': {
        'imageUrl': 'https://ai/j.png',
        'category': 'jacket',
        'colors': <dynamic>[],
      },
    });

    await tester.pumpWidget(UncontrolledProviderScope(
      container: container,
      child: const MaterialApp(
        home: Scaffold(body: Center(child: SlotStrip())),
      ),
    ));
    await tester.pumpAndSettle();

    expect(find.byKey(const ValueKey('changed_dot_jacket')), findsOneWidget);
    expect(find.byKey(const ValueKey('ai_badge_jacket')), findsOneWidget);
    expect(find.byKey(const ValueKey('changed_dot_shirt')), findsNothing);
  });

  testWidgets('add item sheet lists wardrobe items for the slot category',
      (tester) async {
    final container = ProviderContainer(overrides: _overrides(_FakeApi()));
    addTearDown(container.dispose);

    await tester.pumpWidget(UncontrolledProviderScope(
      container: container,
      child: MaterialApp(
        home: Scaffold(
          body: Builder(
            builder: (context) => Center(
              child: TextButton(
                onPressed: () => showAddItemSheet(context, 'shirt'),
                child: const Text('open'),
              ),
            ),
          ),
        ),
      ),
    ));
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();

    expect(find.text('Black Hoodie'), findsOneWidget);
    expect(find.byKey(const ValueKey('generate_shirt')), findsOneWidget);
    expect(find.byKey(const ValueKey('upload_shirt')), findsOneWidget);
  });

  testWidgets('generate marks the slot as ai-pending', (tester) async {
    final container = ProviderContainer(overrides: _overrides(_FakeApi()));
    addTearDown(container.dispose);

    await tester.pumpWidget(UncontrolledProviderScope(
      container: container,
      child: MaterialApp(
        home: Scaffold(
          body: Builder(
            builder: (context) => Center(
              child: TextButton(
                onPressed: () => showAddItemSheet(context, 'shirt'),
                child: const Text('open'),
              ),
            ),
          ),
        ),
      ),
    ));
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('generate_shirt')));
    await tester.pumpAndSettle();

    final slot = container.read(tryOnSlotsProvider)['shirt'];
    expect(slot, isNotNull);
    expect((slot as Map)['kind'], 'ai');
  });

  testWidgets('save fit sheet posts from-tryon with the right body',
      (tester) async {
    final fakeApi = _FakeApi();
    final container = ProviderContainer(overrides: _overrides(fakeApi));
    addTearDown(container.dispose);
    container
        .read(tryOnSlotsProvider.notifier)
        .setSlot('shirt', {'kind': 'wardrobe', 'category': 'shirt', 'itemId': 'w1'});
    container.read(tryOnSlotsProvider.notifier).setSlot('jacket', {
      'kind': 'ai',
      'category': 'jacket',
      'aiItem': {
        'imageUrl': 'https://ai/j.png',
        'category': 'jacket',
        'brand': null,
        'fit': 'regular',
        'length': 'hip',
        'colors': [
          {'name': 'blue', 'hex': '#1E6FBA', 'ratio': 1.0},
        ],
      },
    });

    final router = GoRouter(
      initialLocation: '/tryon',
      routes: [
        GoRoute(path: '/tryon', builder: (_, __) => const TryOnScreen()),
        GoRoute(
            path: '/myfit',
            builder: (_, __) => const Scaffold(body: Text('myfit home'))),
      ],
    );

    await tester.pumpWidget(UncontrolledProviderScope(
      container: container,
      child: MaterialApp.router(routerConfig: router),
    ));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const ValueKey('tryon_save_fit')));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const ValueKey('save_fit_name')), 'Night Out');
    await tester.tap(find.byKey(const ValueKey('save_fit_confirm')));
    await tester.pumpAndSettle();

    expect(fakeApi.lastPostPath, ApiEndpoints.outfitsFromTryon);
    expect(fakeApi.lastPostBody, {
      'name': 'Night Out',
      'heroImageUrl': 'https://fit/he.png',
      'slots': [
        {'category': 'shirt', 'wardrobeId': 'w1'},
        {
          'category': 'jacket',
          'aiItem': {
            'imageUrl': 'https://ai/j.png',
            'category': 'jacket',
            'brand': null,
            'fit': 'regular',
            'length': 'hip',
            'colors': [
              {'name': 'blue', 'hex': '#1E6FBA', 'ratio': 1.0},
            ],
          },
        },
      ],
    });
    expect(find.text('myfit home'), findsOneWidget);
  });
}