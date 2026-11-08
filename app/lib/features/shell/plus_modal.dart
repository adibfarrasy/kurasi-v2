import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/design/flair_sheet.dart';
import '../credits/credits_provider.dart';

const TextStyle _funnel = TextStyle(fontFamily: 'FunnelSans', color: Colors.black);
const Color _insufficientRed = Color(0xFFFF0D00);
const List<BoxShadow> _buttonShadow = [BoxShadow(color: Color(0x66000000), offset: Offset(0.5, 1), blurRadius: 1)];

/// Tab-bar plus: Steal the Look, Add Clothes, and the AI balance.
class PlusModal extends ConsumerWidget {
  const PlusModal({super.key});

  static Future<void> show(BuildContext context) {
    // Refetch so the insufficient-balance check reflects recent spends/grants.
    ProviderScope.containerOf(context).invalidate(creditsProvider);
    return showFlairSheet<void>(
      context,
      divider: false,
      above: (sheetContext) => Container(
        height: 60,
        alignment: Alignment.topRight,
        padding: const EdgeInsets.symmetric(horizontal: 20),
        child: GestureDetector(
          key: const ValueKey('plus_close'),
          onTap: () => Navigator.of(sheetContext).pop(),
          child: Container(
            width: 48,
            height: 48,
            alignment: Alignment.center,
            decoration: const BoxDecoration(color: Colors.white, shape: BoxShape.circle, boxShadow: _buttonShadow),
            child: Image.asset('assets/x.png', width: 24, height: 24, color: Colors.black),
          ),
        ),
      ),
      builder: (_) => const PlusModal(),
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final balance = (ref.watch(creditsProvider).valueOrNull?['balance'] as num?)?.toInt() ?? 0;
    void go(String path) {
      final router = GoRouter.of(context);
      Navigator.of(context).pop();
      router.push(path);
    }

    const divider = Divider(height: 1, thickness: 1, color: Color(0xFFE5E5E5));
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 11, 20, 50),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          divider,
          const SizedBox(height: 11),
          _ActionRow(
            key: const ValueKey('plus_steal_the_look'),
            title: 'Steal the Look',
            subtitle: 'Upload an inspiration, and the AI will analyze it for you',
            icon: 'assets/lightbulb-filament.png',
            cost: 6,
            balance: balance,
            onTap: () => go('/steal-the-look'),
          ),
          const SizedBox(height: 11),
          divider,
          const SizedBox(height: 11),
          _ActionRow(
            key: const ValueKey('plus_add_clothes'),
            title: 'Add Clothes',
            subtitle: 'Add items into your wardrobe collection',
            icon: 'assets/t-shirt-upload.png',
            cost: 1,
            unit: '/image',
            balance: balance,
            onTap: () => go('/upload-wardrobe-guide'),
          ),
          const SizedBox(height: 11),
          divider,
          const SizedBox(height: 11),
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 8),
            child: Row(
              children: [
                Image.asset('assets/star.png', width: 24, height: 24),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('AI balance', style: _funnel.copyWith(fontSize: 16, height: 22 / 16, letterSpacing: -0.16)),
                      Text('$balance', style: _funnel.copyWith(fontSize: 20, height: 24 / 20, letterSpacing: -0.3, fontWeight: FontWeight.bold)),
                    ],
                  ),
                ),
                GestureDetector(
                  key: const ValueKey('plus_add_credits'),
                  onTap: () => go('/ai-balance'),
                  child: Container(
                    padding: const EdgeInsets.fromLTRB(12, 8, 16, 8),
                    decoration: BoxDecoration(color: Colors.black, borderRadius: BorderRadius.circular(999)),
                    child: Row(
                      children: [
                        const Text('＋', style: TextStyle(color: Colors.white, fontSize: 18, height: 1)),
                        const SizedBox(width: 6),
                        Text('Add', style: _funnel.copyWith(color: Colors.white, fontSize: 16, height: 22 / 16, letterSpacing: -0.16)),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 11),
          divider,
        ],
      ),
    );
  }
}

class _ActionRow extends StatelessWidget {
  const _ActionRow({
    super.key,
    required this.title,
    required this.subtitle,
    required this.icon,
    required this.cost,
    required this.balance,
    required this.onTap,
    this.unit,
  });

  final String title;
  final String subtitle;
  final String icon;
  final int cost;
  final String? unit;
  final int balance;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final insufficient = balance < cost;
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: insufficient ? null : onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 8),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Text(
                        title,
                        style: _funnel.copyWith(
                          fontSize: 16,
                          height: 22 / 16,
                          letterSpacing: -0.16,
                          color: insufficient ? const Color(0xFF666666) : Colors.black,
                          decoration: insufficient ? TextDecoration.lineThrough : null,
                        ),
                      ),
                      const SizedBox(width: 4),
                      Image.asset('assets/star.png', width: 14, height: 14),
                      const SizedBox(width: 4),
                      Text('$cost', style: _funnel.copyWith(fontSize: 14, height: 18 / 14, fontWeight: FontWeight.bold, color: insufficient ? _insufficientRed : Colors.black)),
                      if (unit != null) ...[
                        const SizedBox(width: 4),
                        Text(unit!, style: _funnel.copyWith(fontSize: 12, height: 16 / 12, letterSpacing: 0.06, color: const Color(0xFF666666))),
                      ],
                    ],
                  ),
                  const SizedBox(height: 4),
                  Text(
                    insufficient ? 'Insufficient AI balance. Purchase more to continue' : subtitle,
                    style: _funnel.copyWith(fontSize: 12, height: 16 / 12, letterSpacing: 0.06, color: insufficient ? _insufficientRed : const Color(0xFF666666)),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 24),
            Opacity(opacity: insufficient ? 0.4 : 1, child: SizedBox(width: 40, height: 40, child: Center(child: Image.asset(icon, width: 32, height: 32)))),
          ],
        ),
      ),
    );
  }
}
