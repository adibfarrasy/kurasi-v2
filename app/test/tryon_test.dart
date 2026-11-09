import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
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
          {
            'id': 'w2',
            'name': 'Denim Jacket',
            'category': 'jacket',
            'imageUrl': 'https://x/w2.png',
            'owned': true,
            'status': 'active',
            'colors': [
              {'name': 'blue', 'hex': '#1E6FBA', 'ratio': 1.0},
            ],
          },
        ];
      case final p when p == ApiEndpoints.outfitRegenerateProgress('s1'):
        return {'phase': 'done', 'resultUrl': 'https://x/regen.png'};
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
    if (path == ApiEndpoints.outfitRegenerate('tryon')) return {'sessionId': 's1'};
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

  test('colorSimilarity scores palettes and buckets by threshold', () {
    final black = [
      {'name': 'black', 'hex': '#000000', 'ratio': 1.0},
    ];
    final white = [
      {'name': 'white', 'hex': '#FFFFFF', 'ratio': 1.0},
    ];
    expect(colorSimilarity(black, black), 1.0);
    expect(colorSimilarity(black, white), 0.0);
    expect(similarityBucket(0.95), 'identical');
    expect(similarityBucket(0.6), 'alternative');
    expect(similarityBucket(0.2), 'other');
  });

  testWidgets('slot strip renders labels, changed dot and ai diamond', (tester) async {
    await tester.pumpWidget(const MaterialApp(
      home: Scaffold(
        body: Center(
          child: SlotStrip(slots: [
            SlotEntry(key: 'shirt', label: 'SHIRT', item: SlotItem(imageUrl: '', brand: 'Nike')),
            SlotEntry(key: 'jacket', label: 'JACKET', item: SlotItem(imageUrl: '', changed: true, aiGenerated: true)),
          ]),
        ),
      ),
    ));
    expect(find.text('SHIRT'), findsOneWidget);
    expect(find.text('JACKET'), findsOneWidget);
    expect(find.text('Nike'), findsOneWidget);
    expect(find.image(const AssetImage('assets/diamond.png')), findsOneWidget);
  });

  testWidgets('picking a saved combination shows the My Fit indicator', (tester) async {
    final container = ProviderContainer(overrides: _overrides(_FakeApi()));
    addTearDown(container.dispose);
    await tester.pumpWidget(UncontrolledProviderScope(
      container: container,
      child: const MaterialApp(home: TryOnScreen()),
    ));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const ValueKey('slot_add')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('add_item_tab_Shirt')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('add_item_w1')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('add_item_done')));
    await tester.pumpAndSettle();

    expect(find.text('My Fit • Night Look', findRichText: true), findsOneWidget);
  });

  testWidgets('new combination regenerates then saves from-tryon', (tester) async {
    final fakeApi = _FakeApi();
    final container = ProviderContainer(overrides: _overrides(fakeApi));
    addTearDown(container.dispose);
    await tester.pumpWidget(UncontrolledProviderScope(
      container: container,
      child: const MaterialApp(home: TryOnScreen()),
    ));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const ValueKey('slot_add')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('add_item_tab_Jacket')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('add_item_w2')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('add_item_done')));
    await tester.pumpAndSettle();

    expect(find.text('Regenerate my fit'), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('tryon_cta')));
    await tester.pump();
    expect(fakeApi.lastPostPath, ApiEndpoints.outfitRegenerate('tryon'));
    await tester.pump(const Duration(seconds: 2));
    await tester.pumpAndSettle();

    expect(find.text('Save to My Fit'), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('tryon_cta')));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const ValueKey('save_fit_name')), 'Night Out');
    await tester.tap(find.byKey(const ValueKey('save_fit_confirm')));
    await tester.pumpAndSettle();

    expect(fakeApi.lastPostPath, ApiEndpoints.outfitsFromTryon);
    expect(fakeApi.lastPostBody, {
      'name': 'Night Out',
      'heroImageUrl': 'https://x/regen.png',
      'heroTurntableUrl': null,
      'slots': [
        {'category': 'jacket', 'wardrobeId': 'w2'},
      ],
    });
  });
}
