import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_typography.dart';
import '../credits/credits_provider.dart';

class PlusModal extends ConsumerStatefulWidget {
  const PlusModal({super.key});

  static Future<void> show(BuildContext context) {
    return showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => const PlusModal(),
    );
  }

  @override
  ConsumerState<PlusModal> createState() => _PlusModalState();
}

class _PlusModalState extends ConsumerState<PlusModal> {
  @override
  void initState() {
    super.initState();
    Future.microtask(() => ref.read(creditsProvider.notifier).refresh());
  }

  void _navigateTo(String location) {
    Navigator.of(context).pop();
    context.go(location);
  }

  @override
  Widget build(BuildContext context) {
    final balance = ref.watch(creditsProvider).value?['balance'] as int? ?? 0;

    return Container(
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      child: SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            _CloseRow(onClose: () => Navigator.of(context).pop()),
            const Divider(height: 1, color: AppColors.page),
            _ActionRow(
              rowKey: const ValueKey('plus_action_steal'),
              title: 'Steal the Look',
              subtitle: 'Upload an inspiration, and the AI will analyze it for you',
              iconAsset: 'assets/sparkle.png',
              cost: 6,
              enabled: balance >= 6,
              onPressed: () => _navigateTo('/steal-the-look'),
            ),
            const Divider(height: 1, color: AppColors.page),
            _ActionRow(
              rowKey: const ValueKey('plus_action_add'),
              title: 'Add Clothes',
              subtitle: 'Add items into your wardrobe collection',
              iconAsset: 'assets/dresser.png',
              cost: 1,
              costUnit: '/image',
              enabled: balance >= 1,
              onPressed: () => _navigateTo('/upload-wardrobe-guide'),
            ),
            const Divider(height: 1, color: AppColors.page),
            _BalanceRow(balance: balance, onAdd: () => _navigateTo('/ai-balance')),
          ],
        ),
      ),
    );
  }
}

class _CloseRow extends StatelessWidget {
  const _CloseRow({required this.onClose});

  final VoidCallback onClose;

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: Alignment.centerRight,
      child: Padding(
        padding: const EdgeInsets.all(8),
        child: InkWell(
          onTap: onClose,
          customBorder: const CircleBorder(),
          child: const SizedBox(
            width: 48,
            height: 48,
            child: Icon(Icons.close, color: AppColors.textPrimary, size: 24),
          ),
        ),
      ),
    );
  }
}

class _ActionRow extends StatelessWidget {
  const _ActionRow({
    required this.rowKey,
    required this.title,
    required this.subtitle,
    required this.iconAsset,
    required this.cost,
    this.costUnit,
    required this.enabled,
    required this.onPressed,
  });

  final Key rowKey;
  final String title;
  final String subtitle;
  final String iconAsset;
  final int cost;
  final String? costUnit;
  final bool enabled;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final titleColor = enabled ? AppColors.textPrimary : Colors.grey;
    final costColor = enabled ? AppColors.textPrimary : AppColors.dontRed;

    return InkWell(
      key: rowKey,
      onTap: enabled ? onPressed : null,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Flexible(
                        child: Text(
                          title,
                          style: AppTypography.body.copyWith(
                            color: titleColor,
                            decoration: enabled
                                ? null
                                : TextDecoration.lineThrough,
                          ),
                        ),
                      ),
                      const SizedBox(width: 4),
                      Text(
                        '$cost',
                        style: AppTypography.buttonLabel.copyWith(color: costColor),
                      ),
                      if (costUnit != null)
                        Text(
                          costUnit!,
                          style: AppTypography.caption.copyWith(
                            color: AppColors.textSecondary,
                          ),
                        ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Text(
                    subtitle,
                    style: AppTypography.caption.copyWith(color: AppColors.textSecondary),
                  ),
                ],
              ),
            ),
            SizedBox(
              width: 40,
              height: 40,
              child: ImageIcon(
                AssetImage(iconAsset),
                size: 32,
                color: AppColors.textPrimary,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _BalanceRow extends StatelessWidget {
  const _BalanceRow({required this.balance, required this.onAdd});

  final int balance;
  final VoidCallback onAdd;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      key: const ValueKey('plus_balance_row'),
      onTap: onAdd,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
        child: Row(
          children: [
            const Expanded(
              child: Text('AI balance', style: AppTypography.body),
            ),
            Text(
              '$balance',
              style: AppTypography.buttonLabel.copyWith(color: AppColors.textPrimary),
            ),
            const SizedBox(width: 12),
            Text(
              'Add',
              style: AppTypography.buttonLabel.copyWith(color: AppColors.accent),
            ),
          ],
        ),
      ),
    );
  }
}