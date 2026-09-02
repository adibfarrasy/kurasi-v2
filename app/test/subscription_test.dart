import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kurasi/core/api/api_client.dart';
import 'package:kurasi/core/api/api_providers.dart';
import 'package:kurasi/core/api/endpoints.dart';
import 'package:kurasi/core/auth/auth_service.dart';
import 'package:kurasi/core/auth/auth_state.dart';
import 'package:kurasi/features/credits/ai_balance_screen.dart';
import 'package:kurasi/features/subscription/subscription_screen.dart';

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
  _FakeApi({this.balance = 5, this.subscription}) : super(Dio());

  int balance;
  Map<String, dynamic>? subscription;
  String? lastPostPath;
  Map<String, dynamic>? lastPostBody;

  @override
  Future<dynamic> get(String path, {Map<String, dynamic>? query}) async {
    switch (path) {
      case ApiEndpoints.subscription:
        return subscription ??
            {
              'subscription': null,
              'isInTrial': true,
              'isCurrent': false,
              'hasAccess': true,
            };
      case ApiEndpoints.credits:
        return {'balance': balance};
      default:
        return <String, dynamic>{};
    }
  }

  @override
  Future<dynamic> post(String path, {Object? body}) async {
    lastPostPath = path;
    lastPostBody = body is Map ? Map<String, dynamic>.from(body) : null;
    if (path == ApiEndpoints.creditsPurchase) {
      balance += (body as Map)['amount'] as int;
      return {'balance': balance};
    }
    return <String, dynamic>{};
  }
}

List<Override> _overrides(_FakeApi api) => [
      apiClientProvider.overrideWithValue(api),
      authServiceProvider.overrideWithValue(_FakeAuth()),
    ];

void main() {
  testWidgets('subscription screen shows trial chip and start posts',
      (tester) async {
    final api = _FakeApi();
    await tester.pumpWidget(ProviderScope(
      overrides: _overrides(api),
      child: const MaterialApp(home: SubscriptionScreen()),
    ));
    await tester.pumpAndSettle();

    expect(find.text('IN TRIAL'), findsOneWidget);

    await tester.tap(find.byKey(const ValueKey('subscription_start')));
    await tester.pumpAndSettle();

    expect(api.lastPostPath, ApiEndpoints.subscription);
    expect(api.lastPostBody, {'providerRef': null});
  });

  testWidgets('subscription screen cancel posts the cancel endpoint',
      (tester) async {
    final api = _FakeApi(subscription: {
      'subscription': {
        'id': 's1',
        'status': 'active',
        'interval': 'monthly',
        'currentPeriodEnd': '2026-09-30T00:00:00',
      },
      'isInTrial': false,
      'isCurrent': true,
      'hasAccess': true,
    });
    await tester.pumpWidget(ProviderScope(
      overrides: _overrides(api),
      child: const MaterialApp(home: SubscriptionScreen()),
    ));
    await tester.pumpAndSettle();

    expect(find.text('ACTIVE'), findsOneWidget);

    await tester.tap(find.byKey(const ValueKey('subscription_cancel')));
    await tester.pumpAndSettle();

    expect(api.lastPostPath, ApiEndpoints.subscriptionCancel);
  });

  testWidgets('cancelled subscription CTA posts renew-success', (tester) async {
    final api = _FakeApi(subscription: {
      'subscription': {
        'id': 's1',
        'status': 'cancelled',
        'interval': 'monthly',
        'currentPeriodEnd': '2026-09-30T00:00:00',
      },
      'isInTrial': false,
      'isCurrent': false,
      'hasAccess': true,
    });
    await tester.pumpWidget(ProviderScope(
      overrides: _overrides(api),
      child: const MaterialApp(home: SubscriptionScreen()),
    ));
    await tester.pumpAndSettle();

    expect(find.text('CANCELLED'), findsOneWidget);
    expect(find.text('Renew Subscription'), findsOneWidget);

    await tester.tap(find.byKey(const ValueKey('subscription_start')));
    await tester.pumpAndSettle();

    expect(api.lastPostPath, ApiEndpoints.subscriptionRenewSuccess);
  });

  testWidgets('ai balance purchase posts chosen amount and updates balance',
      (tester) async {
    final api = _FakeApi(balance: 5);
    await tester.pumpWidget(ProviderScope(
      overrides: _overrides(api),
      child: const MaterialApp(home: AiBalanceScreen()),
    ));
    await tester.pumpAndSettle();

    expect(_balanceText(tester), '5');

    await tester.tap(find.byKey(const ValueKey('package_20')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('ai_balance_continue')));
    await tester.pumpAndSettle();

    expect(api.lastPostPath, ApiEndpoints.creditsPurchase);
    expect(api.lastPostBody, {'amount': 20});
    expect(_balanceText(tester), '25');
  });

  testWidgets('ai balance custom amount posts chosen amount', (tester) async {
    final api = _FakeApi(balance: 5);
    await tester.pumpWidget(ProviderScope(
      overrides: _overrides(api),
      child: const MaterialApp(home: AiBalanceScreen()),
    ));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const ValueKey('package_other')));
    await tester.pumpAndSettle();
    await tester.enterText(
        find.byKey(const ValueKey('ai_balance_custom')), '35');
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('ai_balance_continue')));
    await tester.pumpAndSettle();

    expect(api.lastPostPath, ApiEndpoints.creditsPurchase);
    expect(api.lastPostBody, {'amount': 35});
  });

  testWidgets(
      'ai balance defaults to the 20 pack and discounts custom >= \$10 by 10%',
      (tester) async {
    final api = _FakeApi(balance: 5);
    await tester.pumpWidget(ProviderScope(
      overrides: _overrides(api),
      child: const MaterialApp(home: AiBalanceScreen()),
    ));
    await tester.pumpAndSettle();

    expect(find.byKey(const ValueKey('ai_balance_custom')), findsNothing);
    expect(find.text('\$18.00'), findsOneWidget);

    await tester.tap(find.byKey(const ValueKey('package_other')));
    await tester.pumpAndSettle();
    await tester.enterText(
        find.byKey(const ValueKey('ai_balance_custom')), '15');
    await tester.pumpAndSettle();

    expect(find.text('Discount • 10%'), findsOneWidget);
    expect(find.text('-\$1.50'), findsOneWidget);
    expect(find.text('\$13.50'), findsOneWidget);
  });
}

String _balanceText(WidgetTester tester) =>
    tester.widget<Text>(find.byKey(const ValueKey('ai_balance_value'))).data!;