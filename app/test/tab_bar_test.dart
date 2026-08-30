import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kurasi/core/design/tab_bar.dart';
import 'package:kurasi/core/theme/app_colors.dart';
import 'package:kurasi/features/credits/credits_provider.dart';
import 'package:kurasi/features/shell/plus_modal.dart';

class _FakeCreditsNotifier extends CreditsNotifier {
  @override
  Future<Map<String, dynamic>> build() async => {'balance': 0};
}

void main() {
  group('CustomTabBar', () {
    testWidgets('renders three labels and a plus button; plus fires onPlus',
        (tester) async {
      var plusTapped = false;
      await tester.pumpWidget(MaterialApp(
        home: Scaffold(
          body: CustomTabBar(
            index: 1,
            onIndexChanged: (_) {},
            onPlus: () => plusTapped = true,
            bottomInset: 0,
          ),
        ),
      ));

      expect(find.text('Try On'), findsOneWidget);
      expect(find.text('My Fit'), findsOneWidget);
      expect(find.text('Wardrobe'), findsOneWidget);

      await tester.tap(find.byKey(const ValueKey('tab_plus_button')));
      expect(plusTapped, isTrue);
    });
  });

  group('PlusModal', () {
    Future<void> pumpModal(WidgetTester tester) async {
      await tester.pumpWidget(ProviderScope(
        overrides: [creditsProvider.overrideWith(_FakeCreditsNotifier.new)],
        child: MaterialApp(
          home: Scaffold(
            body: Builder(
              builder: (context) => Center(
                child: TextButton(
                  onPressed: () => PlusModal.show(context),
                  child: const Text('open'),
                ),
              ),
            ),
          ),
        ),
      ));
      await tester.tap(find.text('open'));
      await tester.pumpAndSettle();
    }

    testWidgets('shows the two action rows', (tester) async {
      await pumpModal(tester);

      expect(find.text('Steal the Look'), findsOneWidget);
      expect(find.text('Add Clothes'), findsOneWidget);
    });

    testWidgets('with balance 0 both actions are disabled with red costs',
        (tester) async {
      await pumpModal(tester);

      final stealTitle = tester.widget<Text>(find.text('Steal the Look'));
      expect(stealTitle.style?.color, Colors.grey);
      final addTitle = tester.widget<Text>(find.text('Add Clothes'));
      expect(addTitle.style?.color, Colors.grey);

      final stealCost = tester.widget<Text>(find.text('6'));
      expect(stealCost.style?.color, AppColors.dontRed);
      final addCost = tester.widget<Text>(find.text('1'));
      expect(addCost.style?.color, AppColors.dontRed);

      await tester.tap(find.byKey(const ValueKey('plus_action_steal')));
      await tester.pumpAndSettle();
      expect(find.byType(PlusModal), findsOneWidget);

      await tester.tap(find.byKey(const ValueKey('plus_action_add')));
      await tester.pumpAndSettle();
      expect(find.byType(PlusModal), findsOneWidget);
    });
  });
}