import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api/api_providers.dart';
import '../../core/api/endpoints.dart';
import 'credits_provider.dart';

const TextStyle _funnel = TextStyle(fontFamily: 'FunnelSans', color: Colors.black);

typedef _Package = ({String id, int? credits, int? price, int discountPct});

const List<_Package> _packages = [
  (id: '20', credits: 20, price: 18, discountPct: 10),
  (id: '50', credits: 50, price: 40, discountPct: 20),
  (id: '100', credits: 100, price: 70, discountPct: 30),
  (id: 'other', credits: null, price: null, discountPct: 0),
];

/// Current balance plus credit packages; custom amounts of $10+ get 10% off.
class AiBalanceScreen extends ConsumerStatefulWidget {
  const AiBalanceScreen({super.key});

  @override
  ConsumerState<AiBalanceScreen> createState() => _AiBalanceScreenState();
}

class _AiBalanceScreenState extends ConsumerState<AiBalanceScreen> {
  String _selected = '20';
  final _custom = TextEditingController();
  bool _busy = false;

  @override
  void dispose() {
    _custom.dispose();
    super.dispose();
  }

  Future<void> _purchase(int amount) async {
    setState(() => _busy = true);
    try {
      await ref.read(apiClientProvider).post(ApiEndpoints.creditsPurchase, body: {'amount': amount});
      await ref.read(creditsProvider.notifier).refresh();
      if (!mounted) return;
      await showDialog<void>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('Purchase complete'),
          content: Text('+$amount AI credits added.'),
          actions: [TextButton(onPressed: () => Navigator.of(ctx).pop(), child: const Text('OK'))],
        ),
      );
      if (mounted && Navigator.of(context).canPop()) Navigator.of(context).pop();
    } catch (err) {
      if (!mounted) return;
      await showDialog<void>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('Purchase failed'),
          content: Text('$err'),
          actions: [TextButton(onPressed: () => Navigator.of(ctx).pop(), child: const Text('OK'))],
        ),
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final insets = MediaQuery.paddingOf(context);
    final balance = (ref.watch(creditsProvider).valueOrNull?['balance'] as num?)?.toInt() ?? 0;
    final pkg = _packages.firstWhere((p) => p.id == _selected);
    final isOther = _selected == 'other';
    final custom = int.tryParse(_custom.text) ?? 0;
    final credits = isOther ? custom : pkg.credits!;
    final base = credits.toDouble();
    final otherPct = base >= 10 ? 10 : 0;
    final discount = isOther ? base * otherPct / 100 : base - pkg.price!;
    final total = isOther ? base - discount : pkg.price!.toDouble();
    final pct = isOther ? otherPct : pkg.discountPct;
    final canPurchase = credits > 0 && !_busy;
    const kirang = TextStyle(fontFamily: 'KirangHaerang', fontSize: 38, height: 36 / 38);

    Widget card(_Package p) => _PackageCard(pkg: p, selected: p.id == _selected, onTap: () => setState(() => _selected = p.id));

    return Scaffold(
      backgroundColor: const Color(0xFFE5E5E5),
      body: Stack(
        children: [
          Column(
            children: [
              Padding(
                padding: EdgeInsets.fromLTRB(20, insets.top + 8, 20, 12),
                child: Stack(
                  alignment: Alignment.center,
                  children: [
                    const SizedBox(width: double.infinity, height: 40),
                    Positioned(
                      left: 0,
                      top: 0,
                      child: GestureDetector(
                        onTap: () => Navigator.of(context).pop(),
                        child: Padding(padding: const EdgeInsets.all(8), child: Image.asset('assets/arrow-left.png', width: 24, height: 24)),
                      ),
                    ),
                    const Text.rich(TextSpan(
                      style: TextStyle(fontFamily: 'BebasNeue', fontSize: 32, height: 36 / 32, color: Colors.black),
                      children: [
                        TextSpan(text: 'AI B'),
                        TextSpan(text: 'A', style: kirang),
                        TextSpan(text: 'LAN'),
                        TextSpan(text: 'C', style: kirang),
                        TextSpan(text: 'E'),
                      ],
                    )),
                  ],
                ),
              ),
              Expanded(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.only(top: 16, bottom: 460),
                  child: Center(
                    child: SizedBox(
                      width: 333,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Text('Current Balance', style: _funnel.copyWith(fontSize: 12, height: 16 / 12, letterSpacing: 0.06, color: const Color(0xFF666666))),
                          const SizedBox(height: 8),
                          SizedBox(
                            height: 60,
                            child: Row(
                              children: [
                                Text('$balance', key: const ValueKey('ai_balance_value'), style: _funnel.copyWith(fontSize: 60, height: 1, letterSpacing: -0.9, fontWeight: FontWeight.bold)),
                                const SizedBox(width: 8),
                                Transform.translate(offset: const Offset(0, -8), child: Image.asset('assets/star.png', width: 32, height: 32)),
                              ],
                            ),
                          ),
                          const SizedBox(height: 20),
                          Text('Buy Extra AI Credit', style: _funnel.copyWith(fontSize: 20, height: 24 / 20, letterSpacing: -0.3, fontWeight: FontWeight.bold)),
                          const SizedBox(height: 15),
                          Row(children: [card(_packages[0]), const SizedBox(width: 15), card(_packages[1])]),
                          const SizedBox(height: 15),
                          Row(children: [card(_packages[2]), const SizedBox(width: 15), card(_packages[3])]),
                          if (isOther) ...[
                            const SizedBox(height: 20),
                            Container(
                              height: 48,
                              padding: const EdgeInsets.symmetric(horizontal: 15),
                              decoration: BoxDecoration(color: Colors.white, border: Border.all(color: const Color(0xFF8F8F8F))),
                              child: Row(
                                children: [
                                  Expanded(
                                    child: TextField(
                                      key: const ValueKey('ai_balance_custom'),
                                      controller: _custom,
                                      autofocus: true,
                                      keyboardType: TextInputType.number,
                                      inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                                      cursorColor: const Color(0xFFFF0D00),
                                      onChanged: (_) => setState(() {}),
                                      style: _funnel.copyWith(fontSize: 20, height: 24 / 20, letterSpacing: -0.3, fontWeight: FontWeight.bold),
                                      decoration: const InputDecoration(isCollapsed: true, border: InputBorder.none, hintText: '0', hintStyle: TextStyle(color: Color(0xFF8F8F8F))),
                                    ),
                                  ),
                                  const SizedBox(width: 10),
                                  Text('AI Credit', style: _funnel.copyWith(fontSize: 16, height: 22 / 16, letterSpacing: -0.16, color: const Color(0xFF666666))),
                                ],
                              ),
                            ),
                          ],
                          SizedBox(height: isOther ? 20 : 32),
                          Container(
                            padding: const EdgeInsets.all(15),
                            decoration: BoxDecoration(border: Border.all(color: const Color(0xFF8F8F8F))),
                            child: Column(
                              children: [
                                _SummaryRow(label: const Text('AI credit', style: _rowLabel), value: '\$${base.toStringAsFixed(2)}'),
                                const SizedBox(height: 15),
                                _SummaryRow(
                                  label: Text.rich(TextSpan(style: _rowLabel, children: [
                                    const TextSpan(text: 'Discount • '),
                                    TextSpan(text: '$pct%', style: const TextStyle(fontWeight: FontWeight.bold)),
                                  ])),
                                  value: '\$${discount.toStringAsFixed(2)}',
                                ),
                                const SizedBox(height: 15),
                                const ColoredBox(color: Color(0xFF8F8F8F), child: SizedBox(height: 1, width: double.infinity)),
                                const SizedBox(height: 15),
                                _SummaryRow(label: const Text('Total due', style: _rowLabel), value: '\$${total.toStringAsFixed(2)}', bold: true),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
          Positioned(
            left: 20,
            right: 20,
            bottom: insets.bottom + 16,
            child: GestureDetector(
              key: const ValueKey('ai_balance_continue'),
              onTap: canPurchase ? () => _purchase(credits) : null,
              child: Container(
                height: 56,
                alignment: Alignment.center,
                decoration: BoxDecoration(color: canPurchase ? Colors.black : const Color(0xFF8F8F8F), borderRadius: BorderRadius.circular(99)),
                child: Text(_busy ? 'Processing…' : 'Continue', style: _funnel.copyWith(color: Colors.white, fontSize: 16, height: 24 / 16, letterSpacing: -0.24, fontWeight: FontWeight.w500)),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

const TextStyle _rowLabel = TextStyle(fontFamily: 'FunnelSans', fontSize: 16, height: 22 / 16, letterSpacing: -0.16, color: Colors.black);

class _SummaryRow extends StatelessWidget {
  const _SummaryRow({required this.label, required this.value, this.bold = false});

  final Widget label;
  final String value;
  final bool bold;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        label,
        Text(
          value,
          style: _funnel.copyWith(
            fontSize: bold ? 20 : 16,
            height: bold ? 24 / 20 : 22 / 16,
            letterSpacing: bold ? -0.3 : -0.16,
            fontWeight: bold ? FontWeight.bold : FontWeight.normal,
          ),
        ),
      ],
    );
  }
}

class _PackageCard extends StatelessWidget {
  const _PackageCard({required this.pkg, required this.selected, required this.onTap});

  final _Package pkg;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final isOther = pkg.id == 'other';
    return GestureDetector(
      key: ValueKey('package_${pkg.id}'),
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 150),
        width: 159,
        transform: Matrix4.translationValues(0, selected ? -8 : 0, 0),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(4),
          boxShadow: selected
              ? const [
                  BoxShadow(color: Color(0xBF000000), offset: Offset(1, 8), blurRadius: 20, spreadRadius: -8),
                  BoxShadow(color: Color(0x80000000), offset: Offset(0, 2), blurRadius: 6, spreadRadius: -4),
                  BoxShadow(color: Color(0x40000000), offset: Offset(0, 1), blurRadius: 3, spreadRadius: -2),
                ]
              : const [BoxShadow(color: Color(0x54000000), offset: Offset(0, 1), blurRadius: 1)],
        ),
        clipBehavior: Clip.antiAlias,
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 15, vertical: 11),
              child: Column(
                children: [
                  FittedBox(
                    fit: BoxFit.scaleDown,
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(isOther ? 'Other' : '${pkg.credits}', style: _funnel.copyWith(fontSize: 28, height: 34 / 28, letterSpacing: -0.42, fontWeight: FontWeight.bold)),
                        const SizedBox(width: 4),
                        Image.asset('assets/star.png', width: 16, height: 16),
                      ],
                    ),
                  ),
                  const SizedBox(height: 11),
                  Text(
                    isOther ? 'Specify amount' : '\$${pkg.price}',
                    style: _funnel.copyWith(fontSize: 14, height: 18 / 14, color: isOther ? const Color(0xFF666666) : Colors.black),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 4),
            Container(
              width: double.infinity,
              color: const Color(0xFFEDEDED),
              padding: const EdgeInsets.symmetric(vertical: 10),
              alignment: Alignment.center,
              child: Text(
                isOther ? 'Discount starts at \$10' : 'Save ${pkg.discountPct}%',
                style: _funnel.copyWith(fontSize: 12, height: 16 / 12, letterSpacing: 0.06),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
