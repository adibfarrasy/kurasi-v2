import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api/api_providers.dart';
import '../../core/api/endpoints.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_typography.dart';
import '../credits/credits_provider.dart';
import 'subscription_provider.dart';

/// Subscription screen — Chrome/Gold plan toggle + subscribe/cancel/renew.
/// Billing is monthly (backend `POST /api/subscription`); the weekly
/// pricing copy is carried over statically from the RN screen.
class SubscriptionScreen extends ConsumerStatefulWidget {
  const SubscriptionScreen({super.key});

  @override
  ConsumerState<SubscriptionScreen> createState() => _SubscriptionScreenState();
}

class _SubscriptionScreenState extends ConsumerState<SubscriptionScreen> {
  bool _gold = false;
  bool _busy = false;

  Future<void> _start() => _post(ApiEndpoints.subscription,
      body: const {'providerRef': null});

  Future<void> _cancel() => _post(ApiEndpoints.subscriptionCancel);

  Future<void> _post(String path, {Object? body}) async {
    if (_busy) return;
    setState(() => _busy = true);
    final api = ref.read(apiClientProvider);
    try {
      await api.post(path, body: body);
      ref.invalidate(subscriptionProvider);
      if (path == ApiEndpoints.subscription) {
        await ref.read(creditsProvider.notifier).refresh();
      }
    } catch (err) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('$err')));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  String get _statusLabel {
    final status = ref.read(subscriptionProvider.notifier).status;
    final isInTrial = ref.read(subscriptionProvider.notifier).isInTrial;
    switch (status) {
      case 'active':
        return 'ACTIVE';
      case 'grace':
        return 'GRACE';
      case 'cancelled':
        return 'CANCELLED';
      case 'lapsed':
        return 'LAPSED';
      default:
        return isInTrial ? 'IN TRIAL' : 'NO PLAN';
    }
  }

  @override
  Widget build(BuildContext context) {
    final sub = ref.watch(subscriptionProvider);
    return Scaffold(
      backgroundColor: AppColors.page,
      body: SafeArea(
        child: Column(
          children: [
            _header(context),
            Expanded(
              child: sub.when(
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (err, _) => const Center(
                  child: Text('Failed to load subscription',
                      style: AppTypography.body),
                ),
                data: (_) => _body(context),
              ),
            ),
            _cta(context),
          ],
        ),
      ),
    );
  }

  Widget _header(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 8, 8, 12),
      child: Stack(
        alignment: Alignment.center,
        children: [
          Align(
            alignment: Alignment.centerLeft,
            child: IconButton(
              onPressed: () => Navigator.of(context).pop(),
              icon: const Icon(Icons.arrow_back_ios_new,
                  color: AppColors.textPrimary, size: 22),
            ),
          ),
          Text(
            'SUBSCRIPTION',
            style: AppTypography.display(32)
                .copyWith(color: AppColors.textPrimary, letterSpacing: 0.4),
          ),
        ],
      ),
    );
  }

  Widget _body(BuildContext context) {
    final sub = ref.watch(subscriptionProvider).valueOrNull;
    final subscription = sub?['subscription'] as Map<String, dynamic>?;
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(20, 4, 20, 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Align(
            alignment: Alignment.center,
            child: _StatusChip(label: _statusLabel),
          ),
          const SizedBox(height: 16),
          _PlanToggle(gold: _gold, onChanged: (gold) => setState(() => _gold = gold)),
          const SizedBox(height: 20),
          _PlanCard(gold: _gold),
          if (!_gold && subscription != null) ...[
            const SizedBox(height: 20),
            _renewalRow(subscription),
          ],
        ],
      ),
    );
  }

  Widget _renewalRow(Map<String, dynamic> subscription) {
    final periodEnd = subscription['currentPeriodEnd'] as String?;
    final cancelled = subscription['status'] == 'cancelled';
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const _InfoRow(label: 'Type', value: 'Monthly'),
        const SizedBox(height: 16),
        _InfoRow(
          label: 'Next Renewal Date',
          value: periodEnd?.split('T').first ?? '—',
          trailing: cancelled
              ? null
              : _Pill(
                  key: const ValueKey('subscription_cancel_pill'),
                  label: 'Cancel',
                  onPressed: _busy ? null : _cancel,
                ),
        ),
        const SizedBox(height: 8),
        Text(
          'If you cancel, you can keep using your remaining AI credits',
          style: AppTypography.caption.copyWith(color: AppColors.textSecondary),
        ),
      ],
    );
  }

  Widget _cta(BuildContext context) {
    final status = ref.read(subscriptionProvider.notifier).status;
    final (label, key, onPressed) = switch (status) {
      'active' || 'grace' => (
          'Cancel Subscription',
          const ValueKey('subscription_cancel'),
          _busy ? null : _cancel,
        ),
      'cancelled' => (
          'Renew Subscription',
          const ValueKey('subscription_start'),
          _busy ? null : _start,
        ),
      'lapsed' => (
          'Reactivate Subscription',
          const ValueKey('subscription_start'),
          _busy ? null : _start,
        ),
      _ => (
          'Subscribe',
          const ValueKey('subscription_start'),
          _busy ? null : _start,
        ),
    };
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 4, 20, 16),
      child: SizedBox(
        height: 56,
        child: FilledButton(
          key: key,
          onPressed: onPressed,
          style: FilledButton.styleFrom(
            backgroundColor: AppColors.dark,
            foregroundColor: Colors.white,
            elevation: 0,
            shape: const StadiumBorder(),
            textStyle: AppTypography.buttonLabel,
          ),
          child: Text(label),
        ),
      ),
    );
  }
}

class _StatusChip extends StatelessWidget {
  const _StatusChip({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
      decoration: BoxDecoration(
        color: AppColors.dark,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: AppTypography.slotLabel.copyWith(color: Colors.white),
      ),
    );
  }
}

class _PlanToggle extends StatelessWidget {
  const _PlanToggle({required this.gold, required this.onChanged});

  final bool gold;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 52,
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: const Color(0xFFD9D9D9),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        children: [
          Expanded(
            child: _ToggleTab(
              label: 'Chrome',
              selected: !gold,
              onTap: () => onChanged(false),
            ),
          ),
          Expanded(
            child: _ToggleTab(
              label: 'Gold',
              selected: gold,
              onTap: () => onChanged(true),
            ),
          ),
        ],
      ),
    );
  }
}

class _ToggleTab extends StatelessWidget {
  const _ToggleTab({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: selected ? Colors.white : Colors.transparent,
          borderRadius: BorderRadius.circular(999),
          boxShadow: selected
              ? const [
                  BoxShadow(
                    color: Color(0x1F000000),
                    offset: Offset(0, 1),
                    blurRadius: 2,
                  ),
                ]
              : null,
        ),
        child: Text(
          label,
          style: AppTypography.buttonLabel.copyWith(
            color: selected
                ? AppColors.textPrimary
                : AppColors.textSecondary,
            fontWeight: selected ? FontWeight.w700 : FontWeight.w400,
          ),
        ),
      ),
    );
  }
}

const List<String> _planFeatures = [
  'Add **10 AI credits** / week',
  'Easily visualize clothing items combination',
  'Upload an outfit inspiration and see how it looks on you',
  'Show off your OOTD to your Instagram followers',
];

class _PlanCard extends StatelessWidget {
  const _PlanCard({required this.gold});

  final bool gold;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(24, 24, 24, 32),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(8),
        boxShadow: gold
            ? const [
                BoxShadow(
                  color: Color(0x99CEA050),
                  offset: Offset(1, 8),
                  blurRadius: 15,
                  spreadRadius: -4,
                ),
                BoxShadow(
                  color: Color(0xB3CEA050),
                  offset: Offset(0, 2),
                  blurRadius: 6,
                  spreadRadius: -2,
                ),
              ]
            : const [
                BoxShadow(
                  color: Color(0x14000000),
                  offset: Offset(0, 1),
                  blurRadius: 3,
                ),
              ],
      ),
      child: Stack(
        children: [
          if (!gold)
            const Positioned(
              top: 0,
              right: 0,
              child: _PlanBadge(),
            ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                gold ? 'Gold Button' : 'Pro Button',
                style: AppTypography.buttonLabel.copyWith(
                  color: AppColors.textPrimary,
                  fontSize: 24,
                  height: 28 / 24,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 4),
              const _PriceRow(),
              const SizedBox(height: 24),
              for (final feature in _planFeatures) ...[
                _FeatureRow(text: feature),
                const SizedBox(height: 11),
              ],
            ],
          ),
        ],
      ),
    );
  }
}

class _PlanBadge extends StatelessWidget {
  const _PlanBadge();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: const BoxDecoration(
        color: AppColors.accent,
        borderRadius: BorderRadius.only(bottomLeft: Radius.circular(8)),
      ),
      child: Text(
        'Your Plan',
        style: AppTypography.slotLabel.copyWith(color: Colors.white),
      ),
    );
  }
}

class _PriceRow extends StatelessWidget {
  const _PriceRow();

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.baseline,
      textBaseline: TextBaseline.alphabetic,
      children: [
        const Text(
          r'$1',
          style: TextStyle(
            fontFamily: 'FunnelSans',
            fontSize: 36,
            height: 40 / 36,
            letterSpacing: -0.54,
            fontWeight: FontWeight.w700,
            color: AppColors.textPrimary,
          ),
        ),
        const Text(
          '.99',
          style: TextStyle(
            fontFamily: 'FunnelSans',
            fontSize: 18,
            height: 22 / 18,
            letterSpacing: -0.27,
            fontWeight: FontWeight.w700,
            color: AppColors.textPrimary,
          ),
        ),
        const SizedBox(width: 6),
        Text(
          '/ week',
          style: AppTypography.body.copyWith(color: AppColors.textSecondary),
        ),
      ],
    );
  }
}

class _FeatureRow extends StatelessWidget {
  const _FeatureRow({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    final parts = text.split('**');
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Icon(Icons.check_rounded, size: 20, color: AppColors.textPrimary),
        const SizedBox(width: 11),
        Expanded(
          child: Text.rich(
            TextSpan(
              children: [
                for (var i = 0; i < parts.length; i++)
                  TextSpan(
                    text: parts[i],
                    style: TextStyle(
                      fontFamily: 'FunnelSans',
                      fontSize: 14,
                      height: 18 / 14,
                      color: AppColors.textPrimary,
                      fontWeight: i % 2 == 1 ? FontWeight.w700 : FontWeight.w400,
                    ),
                  ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _InfoRow extends StatelessWidget {
  const _InfoRow({required this.label, required this.value, this.trailing});

  final String label;
  final String value;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              label,
              style: AppTypography.caption.copyWith(color: AppColors.textSecondary),
            ),
            const SizedBox(height: 2),
            Text(
              value,
              style: AppTypography.body.copyWith(color: AppColors.textPrimary),
            ),
          ],
        ),
        if (trailing != null) trailing!,
      ],
    );
  }
}

class _Pill extends StatelessWidget {
  const _Pill({super.key, required this.label, required this.onPressed});

  final String label;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    return OutlinedButton(
      onPressed: onPressed,
      style: OutlinedButton.styleFrom(
        foregroundColor: AppColors.textPrimary,
        side: const BorderSide(color: AppColors.hairline),
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
        shape: const StadiumBorder(),
        textStyle: AppTypography.buttonLabel,
      ),
      child: Text(label),
    );
  }
}