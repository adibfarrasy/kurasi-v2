import 'dart:io';

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
import 'package:kurasi/features/steal_the_look/analyzing_screen.dart';
import 'package:kurasi/features/steal_the_look/failed_screen.dart';
import 'package:kurasi/features/steal_the_look/guide_screen.dart';
import 'package:kurasi/features/tryon/steal_the_look_draft.dart';
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
  _FakeApi({required this.getResponse}) : super(Dio());

  final Map<String, dynamic> getResponse;

  String? lastPostPath;
  Map<String, dynamic>? lastPostBody;

  @override
  Future<dynamic> post(String path, {Object? body}) async {
    lastPostPath = path;
    lastPostBody = body is Map ? Map<String, dynamic>.from(body) : null;
    return {'sessionId': 's1'};
  }

  @override
  Future<dynamic> get(String path, {Map<String, dynamic>? query}) async {
    return getResponse;
  }
}

List<Override> _overrides(_FakeApi api) => [
      apiClientProvider.overrideWithValue(api),
      authServiceProvider.overrideWithValue(_FakeAuth()),
      stealTheLookDraftProvider.overrideWith((ref) => null),
    ];

Future<String> _tempImageFile() async {
  final file =
      File('${Directory.systemTemp.path}/stl_${DateTime.now().microsecondsSinceEpoch}.jpg');
  await file.writeAsBytes(List<int>.filled(64, 7));
  addTearDown(() {
    if (file.existsSync()) file.deleteSync();
  });
  return file.path;
}

Map<String, dynamic> _doneResponse() => {
      'phase': 'done',
      'result': 'no_error',
      'heroImageUrl': 'https://fit/he.png',
      'items': <dynamic>[],
      'tone': 'neutral',
    };

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  test('notifier posts image base64 and sets the draft on no_error result', () async {
    final api = _FakeApi(getResponse: _doneResponse());
    final container = ProviderContainer(overrides: _overrides(api));
    addTearDown(container.dispose);

    final uri = await _tempImageFile();
    await container.read(stealTheLookJobProvider.notifier).startJob(uri: uri);

    expect(api.lastPostPath, ApiEndpoints.stealTheLook);
    expect(api.lastPostBody!['mimeType'], 'image/jpeg');
    expect(api.lastPostBody!['imageBase64'], isA<String>());

    final draft = container.read(stealTheLookDraftProvider);
    expect(draft, isNotNull);
    expect(draft?['heroImageUrl'], 'https://fit/he.png');
    expect(draft?['tone'], 'neutral');
  });

  test('notifier surfaces an error result without setting the draft', () async {
    final api = _FakeApi(getResponse: {
      'phase': 'done',
      'result': 'multiple_people',
      'heroImageUrl': null,
      'items': <dynamic>[],
      'tone': 'neutral',
    });
    final container = ProviderContainer(overrides: _overrides(api));
    addTearDown(container.dispose);

    final uri = await _tempImageFile();
    await container.read(stealTheLookJobProvider.notifier).startJob(uri: uri);

    expect(container.read(stealTheLookDraftProvider), isNull);
    expect(container.read(stealTheLookJobProvider).value?.result, 'multiple_people');
  });

  testWidgets('analyzing screen sets the draft and navigates to /tryon', (tester) async {
    final api = _FakeApi(getResponse: _doneResponse());
    final container = ProviderContainer(overrides: _overrides(api));
    addTearDown(container.dispose);

    final file =
        File('${Directory.systemTemp.path}/stl_w_${DateTime.now().microsecondsSinceEpoch}.jpg');
    file.writeAsBytesSync(List<int>.filled(64, 7));
    addTearDown(() {
      if (file.existsSync()) file.deleteSync();
    });

    final router = GoRouter(
      initialLocation:
          '/steal-the-look/analyzing?uri=${Uri.encodeQueryComponent(file.path)}',
      routes: [
        GoRoute(path: '/steal-the-look', builder: (_, __) => const Scaffold(body: Text('stl guide'))),
        GoRoute(
          path: '/steal-the-look/analyzing',
          builder: (_, state) =>
              StealTheLookAnalyzingScreen(uri: state.uri.queryParameters['uri']),
        ),
        GoRoute(
          path: '/steal-the-look/failed',
          builder: (_, state) =>
              StealTheLookFailedScreen(reason: state.uri.queryParameters['reason']),
        ),
        GoRoute(path: '/tryon', builder: (_, __) => const Scaffold(body: Text('tryon home'))),
      ],
    );

    await tester.runAsync(() async {
      await tester.pumpWidget(UncontrolledProviderScope(
        container: container,
        child: MaterialApp.router(routerConfig: router),
      ));
      // The screen holds on the final stage for 3s (a real timer here) before leaving.
      await Future<void>.delayed(const Duration(milliseconds: 3300));
    });
    await tester.pumpAndSettle();

    expect(container.read(stealTheLookDraftProvider), isNotNull);
    expect(find.text('tryon home'), findsOneWidget);
  });

  testWidgets('analyzing screen navigates to failed on an error result', (tester) async {
    final api = _FakeApi(getResponse: {
      'phase': 'done',
      'result': 'multiple_people',
      'heroImageUrl': null,
      'items': <dynamic>[],
      'tone': 'neutral',
    });
    final container = ProviderContainer(overrides: _overrides(api));
    addTearDown(container.dispose);

    final file =
        File('${Directory.systemTemp.path}/stl_f_${DateTime.now().microsecondsSinceEpoch}.jpg');
    file.writeAsBytesSync(List<int>.filled(64, 7));
    addTearDown(() {
      if (file.existsSync()) file.deleteSync();
    });

    final router = GoRouter(
      initialLocation:
          '/steal-the-look/analyzing?uri=${Uri.encodeQueryComponent(file.path)}',
      routes: [
        GoRoute(path: '/steal-the-look', builder: (_, __) => const Scaffold(body: Text('stl guide'))),
        GoRoute(
          path: '/steal-the-look/analyzing',
          builder: (_, state) =>
              StealTheLookAnalyzingScreen(uri: state.uri.queryParameters['uri']),
        ),
        GoRoute(
          path: '/steal-the-look/failed',
          builder: (_, state) =>
              StealTheLookFailedScreen(reason: state.uri.queryParameters['reason']),
        ),
        GoRoute(path: '/tryon', builder: (_, __) => const Scaffold(body: Text('tryon home'))),
      ],
    );

    await tester.runAsync(() async {
      await tester.pumpWidget(UncontrolledProviderScope(
        container: container,
        child: MaterialApp.router(routerConfig: router),
      ));
      await Future<void>.delayed(const Duration(milliseconds: 200));
    });
    await tester.pumpAndSettle();

    expect(find.text("Can't proceed with the outfit breakdown"), findsOneWidget);
    expect(find.text('Upload another picture'), findsOneWidget);
  });

  testWidgets('guide screen shows do/dont cards and the upload button', (tester) async {
    final api = _FakeApi(getResponse: _doneResponse());
    final container = ProviderContainer(overrides: _overrides(api));
    addTearDown(container.dispose);

    await tester.pumpWidget(UncontrolledProviderScope(
      container: container,
      child: const MaterialApp(home: StealTheLookScreen()),
    ));
    await tester.pumpAndSettle();

    expect(find.text('DO'), findsOneWidget);
    expect(find.text("DON'T"), findsOneWidget);
    expect(find.text('Upload a picture'), findsOneWidget);
    expect(find.byKey(const ValueKey('stl_upload')), findsOneWidget);
  });

  testWidgets('failed screen shows multiple_people copy and a retry button', (tester) async {
    final api = _FakeApi(getResponse: _doneResponse());
    final container = ProviderContainer(overrides: _overrides(api));
    addTearDown(container.dispose);

    await tester.pumpWidget(UncontrolledProviderScope(
      container: container,
      child: const MaterialApp(home: StealTheLookFailedScreen(reason: 'multiple_people')),
    ));
    await tester.pumpAndSettle();

    expect(find.text("Can't proceed with the outfit breakdown"), findsOneWidget);
    expect(find.text('Upload another picture'), findsOneWidget);
    expect(find.byKey(const ValueKey('stl_retry')), findsOneWidget);
  });
}