import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api/api_providers.dart';
import '../../core/api/endpoints.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_typography.dart';
import 'credits_provider.dart';

/// AI Balance / top-up screen. Balance comes from [creditsProvider]; a 2x2
/// package grid (20/50/100 + custom) drives `POST /api/credits/purchase`,
/// after which the balance provider is refreshed.
class AiBalanceScreen extends ConsumerStatefulWidget {
  const AiBalanceScreen({super.key});

  @override
  ConsumerState<AiBalanceScreen> createState() => _AiBalanceScreenState();
}

class _AiBalanceScreenState extends ConsumerState<AiBalanceScreen> {
  static const _packages = [
    (credits: 20, price: 18, discountPct: 10),
    (credits: 50, price: 40, discountPct: 20),
    (credits: 100, price: 70, discountPct: 30),
  ];

  int? _selected = 20;
  final TextEditingController _custom = TextEditingController();
  bool _busy = false;

  @override
  void dispose() {
    _custom.dispose();
    super.dispose();
  }

  int get _amount {
    final preset = _selected;
    if (preset != null) return preset;
    return int.tryParse(_custom.text.trim()) ?? 0;
  }

  Future<void> _purchase() async {
    final amount = _amount;
    if (amount <= 0 || _busy) return;
    setState(() => _busy = true);
    final api = ref.read(apiClientProvider);
    try {
      await api.post(ApiEndpoints.creditsPurchase, body: {'amount': amount});
      await ref.read(creditsProvider.notifier).refresh();
    } catch (err) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('$err')));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final credits = ref.watch(creditsProvider);
    final balance = credits.value?['balance'] as int? ?? 0;
    final canBuy = _amount > 0 && !_busy;

    return Scaffold(
      backgroundColor: AppColors.page,
      body: SafeArea(
        child: Column(
          children: [
            _header(context),
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Current Balance',
                      style: AppTypography.caption
                          .copyWith(color: AppColors.textSecondary),
                    ),
                    const SizedBox(height: 8),
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.center,
                      children: [
                        Text(
                          '$balance',
                          key: const ValueKey('ai_balance_value'),
                          style: const TextStyle(
                            fontFamily: 'FunnelSans',
                            fontSize: 60,
                            height: 60 / 60,
                            letterSpacing: -0.9,
                            fontWeight: FontWeight.w700,
                            color: AppColors.textPrimary,
                          ),
                        ),
                        const SizedBox(width: 8),
                        const Icon(Icons.star_rounded,
                            size: 32, color: AppColors.textPrimary),
                      ],
                    ),
                    const SizedBox(height: 20),
                    Text(
                      'Buy Extra AI Credit',
                      style: AppTypography.buttonLabel.copyWith(
                        color: AppColors.textPrimary,
                        fontSize: 20,
                        height: 24 / 20,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 15),
                    Row(
                      children: [
                        Expanded(
                          child: _PackageCard(
                            key: const ValueKey('package_20'),
                            label: '20',
                            price: r'$18',
                            badge: 'Save 10%',
                            selected: _selected == 20,
                            onTap: () =>
                                setState(() => _selected = 20),
                          ),
                        ),
                        const SizedBox(width: 15),
                        Expanded(
                          child: _PackageCard(
                            key: const ValueKey('package_50'),
                            label: '50',
                            price: r'$40',
                            badge: 'Save 20%',
                            selected: _selected == 50,
                            onTap: () =>
                                setState(() => _selected = 50),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 15),
                    Row(
                      children: [
                        Expanded(
                          child: _PackageCard(
                            key: const ValueKey('package_100'),
                            label: '100',
                            price: r'$70',
                            badge: 'Save 30%',
                            selected: _selected == 100,
                            onTap: () =>
                                setState(() => _selected = 100),
                          ),
                        ),
                        const SizedBox(width: 15),
                        Expanded(
                          child: _PackageCard(
                            key: const ValueKey('package_other'),
                            label: 'Other',
                            price: 'Specify amount',
                            badge: 'Discount starts at \$10',
                            selected: _selected == null,
                            onTap: () =>
                                setState(() => _selected = null),
                          ),
                        ),
                      ],
                    ),
                    if (_selected == null) ...[
                      const SizedBox(height: 16),
                      TextField(
                        key: const ValueKey('ai_balance_custom'),
                        controller: _custom,
                        keyboardType: TextInputType.number,
                        onChanged: (_) => setState(() {}),
                        decoration: InputDecoration(
                          hintText: 'Amount of AI credits',
                          filled: true,
                          fillColor: Colors.white,
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(12),
                            borderSide: BorderSide.none,
                          ),
                        ),
                      ),
                    ],
                    const SizedBox(height: 20),
                    _SummaryBox(
                      baseCost: _selected != null
                          ? (_selected! * 1).toDouble()
                          : (_amount > 0 ? _amount * 1.0 : 0),
                      discountPct: _selected != null
                          ? _packages
                              .firstWhere((p) => p.credits == _selected)
                              .discountPct
                          : (_amount >= 10 ? 10 : 0),
                      price: _selected != null
                          ? _packages
                              .firstWhere((p) => p.credits == _selected)
                              .price
                              .toDouble()
                          : null,
                    ),
                  ],
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 4, 20, 16),
              child: SizedBox(
                height: 56,
                child: FilledButton(
                  key: const ValueKey('ai_balance_continue'),
                  onPressed: canBuy ? _purchase : null,
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.dark,
                    foregroundColor: Colors.white,
                    elevation: 0,
                    shape: const StadiumBorder(),
                    textStyle: AppTypography.buttonLabel,
                  ),
                  child: Text(_busy ? 'Purchasing…' : 'Continue'),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _header(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 8, 8, 4),
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
            'AI BALANCE',
            style: AppTypography.display(32)
                .copyWith(color: AppColors.textPrimary, letterSpacing: 0.4),
          ),
        ],
      ),
    );
  }
}

class _PackageCard extends StatelessWidget {
  const _PackageCard({
    super.key,
    required this.label,
    required this.price,
    required this.badge,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final String price;
  final String badge;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(4),
          boxShadow: selected
              ? const [
                  BoxShadow(
                    color: Color(0xBF000000),
                    offset: Offset(1, 8),
                    blurRadius: 20,
                    spreadRadius: -8,
                  ),
                  BoxShadow(
                    color: Color(0x80000000),
                    offset: Offset(0, 2),
                    blurRadius: 6,
                    spreadRadius: -4,
                  ),
                ]
              : const [
                  BoxShadow(
                    color: Color(0x54000000),
                    offset: Offset(0, 1),
                    blurRadius: 1,
                  ),
                ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 16),
              child: Column(
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text(
                        label,
                        style: const TextStyle(
                          fontFamily: 'FunnelSans',
                          fontSize: 28,
                          height: 34 / 28,
                          letterSpacing: -0.42,
                          fontWeight: FontWeight.w700,
                          color: AppColors.textPrimary,
                        ),
                      ),
                      const SizedBox(width: 4),
                      const Icon(Icons.star_rounded,
                          size: 16, color: AppColors.textPrimary),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Text(
                    price,
                    style: AppTypography.body.copyWith(
                      color: label == 'Other'
                          ? AppColors.textSecondary
                          : AppColors.textPrimary,
                    ),
                  ),
                ],
              ),
            ),
            Container(
              padding: const EdgeInsets.symmetric(vertical: 10),
              color: const Color(0xFFEDEDED),
              child: Text(
                badge,
                textAlign: TextAlign.center,
                style: AppTypography.caption
                    .copyWith(color: AppColors.textPrimary),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _SummaryBox extends StatelessWidget {
  const _SummaryBox({
    required this.baseCost,
    required this.discountPct,
    required this.price,
  });

  final double baseCost;
  final int discountPct;
  final double? price;

  @override
  Widget build(BuildContext context) {
    final discount = price != null
        ? baseCost - price!
        : baseCost * discountPct / 100;
    final total = price ?? (baseCost - discount);
    return Container(
      padding: const EdgeInsets.all(15),
      decoration: BoxDecoration(
        border: Border.all(color: AppColors.textMuted),
        borderRadius: BorderRadius.circular(4),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _SummaryRow(
              label: 'AI credit', value: '\$${baseCost.toStringAsFixed(2)}'),
          const SizedBox(height: 15),
          _SummaryRow(
            label: 'Discount • $discountPct%',
            value: '-\$${discount.toStringAsFixed(2)}',
          ),
          const SizedBox(height: 15),
          const Divider(height: 1, color: AppColors.textMuted),
          const SizedBox(height: 15),
          _SummaryRow(
            label: 'Total due',
            value: '\$${total.toStringAsFixed(2)}',
            bold: true,
          ),
        ],
      ),
    );
  }
}

class _SummaryRow extends StatelessWidget {
  const _SummaryRow({required this.label, required this.value, this.bold = false});

  final String label;
  final String value;
  final bool bold;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(
          label,
          style: AppTypography.body.copyWith(color: AppColors.textPrimary),
        ),
        Text(
          value,
          style: AppTypography.body.copyWith(
            color: AppColors.textPrimary,
            fontSize: bold ? 20 : 16,
            height: bold ? 24 / 20 : 22 / 16,
            fontWeight: bold ? FontWeight.w700 : FontWeight.w400,
          ),
        ),
      ],
    );
  }
}