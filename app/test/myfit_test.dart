import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kurasi/core/api/api_client.dart';
import 'package:kurasi/core/api/api_providers.dart';
import 'package:kurasi/core/api/endpoints.dart';
import 'package:kurasi/core/auth/auth_service.dart';
import 'package:kurasi/core/auth/auth_state.dart';
import 'package:kurasi/features/myfit/myfit_screen.dart';
import 'package:kurasi/features/myfit/profile_sheet.dart';

class _FakeAuth implements AuthService {
  bool signedOut = false;

  @override
  Future<AuthUser?> signInWithGoogle() async => null;
  @override
  Future<void> signOut() async => signedOut = true;
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
      case ApiEndpoints.outfits:
        return [
          {
            'id': 'o1',
            'heroImageUrl': 'https://x/h.png',
            'name': 'Fit',
            'headwearId': null,
            'baseId': 'w1',
            'outerId': null,
            'bottomId': 'w2',
            'footwearId': null,
          },
        ];
      case ApiEndpoints.wardrobeItems:
        return [
          {'id': 'w1', 'owned': false},
          {'id': 'w2', 'owned': true},
        ];
      case ApiEndpoints.credits:
        return {'balance': 0};
      default:
        return <String, dynamic>{};
    }
  }
}

void main() {
  testWidgets('myfit grid shows outfit card name and ai badge count',
      (tester) async {
    await tester.pumpWidget(ProviderScope(
      overrides: [
        apiClientProvider.overrideWithValue(_FakeApi()),
        authServiceProvider.overrideWithValue(_FakeAuth()),
      ],
      child: const MaterialApp(home: MyFitScreen()),
    ));
    await tester.pumpAndSettle();
    expect(find.text('Fit'), findsOneWidget);
    expect(find.text('1'), findsOneWidget);
  });

  testWidgets('profile sheet log out signs out', (tester) async {
    final fakeAuth = _FakeAuth();
    await tester.pumpWidget(ProviderScope(
      overrides: [
        apiClientProvider.overrideWithValue(_FakeApi()),
        authServiceProvider.overrideWithValue(fakeAuth),
      ],
      child: MaterialApp(
        home: Scaffold(
          body: Builder(
            builder: (context) => Center(
              child: TextButton(
                onPressed: () => ProfileSheet.show(context),
                child: const Text('open'),
              ),
            ),
          ),
        ),
      ),
    ));

    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Log Out'));
    await tester.pumpAndSettle();
    expect(fakeAuth.signedOut, isTrue);
  });
}