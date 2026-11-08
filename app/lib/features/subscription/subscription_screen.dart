import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api/api_providers.dart';
import '../../core/api/endpoints.dart';
import 'subscription_provider.dart';

const List<String> _planFeatures = [
  'Add **10 AI credits** / week',
  'Easily visualize clothing items combination',
  'Upload an outfit inspiration and see how it looks on you',
  'Show off your OOTD to your Instagram followers',
];

const TextStyle _funnel = TextStyle(fontFamily: 'FunnelSans', color: Colors.black);

const List<String> _months = [
  'January', 'February', 'March', 'April', 'May', 'June', //
  'July', 'August', 'September', 'October', 'November', 'December',
];

String _formatDate(String? iso) {
  final d = iso == null ? null : DateTime.tryParse(iso)?.toLocal();
  return d == null ? '—' : '${_months[d.month - 1]} ${d.day}, ${d.year}';
}

/// Plans screen: Chrome (current) / Gold (upgrade) toggle, the plan card,
/// and for Chrome the current subscription's type and renewal controls.
class SubscriptionScreen extends ConsumerStatefulWidget {
  const SubscriptionScreen({super.key});

  @override
  ConsumerState<SubscriptionScreen> createState() => _SubscriptionScreenState();
}

class _SubscriptionScreenState extends ConsumerState<SubscriptionScreen> {
  bool _gold = false;
  bool _busy = false;

  Future<void> _cancel() async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      await ref.read(apiClientProvider).post(ApiEndpoints.subscriptionCancel);
      ref.invalidate(subscriptionProvider);
    } catch (err) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$err')));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final insets = MediaQuery.paddingOf(context);
    final sub = ref.watch(subscriptionProvider).valueOrNull?['subscription'] as Map<String, dynamic>?;
    final cancelled = sub?['status'] == 'cancelled';
    return Scaffold(
      backgroundColor: const Color(0xFFE5E5E5),
      body: Stack(
        children: [
          Column(
            children: [
              SizedBox(
                width: 333,
                child: Padding(
                  padding: EdgeInsets.only(top: insets.top + 8, bottom: 12),
                  child: Stack(
                    alignment: Alignment.center,
                    children: [
                      Positioned(
                        left: 0,
                        top: 0,
                        child: GestureDetector(
                          key: const ValueKey('subscription_back'),
                          onTap: () => Navigator.of(context).pop(),
                          child: Padding(padding: const EdgeInsets.all(8), child: Image.asset('assets/arrow-left.png', width: 24, height: 24)),
                        ),
                      ),
                      Image.asset('assets/logomark-dark.png', width: 160, height: 40),
                    ],
                  ),
                ),
              ),
              Expanded(
                child: SingleChildScrollView(
                  padding: EdgeInsets.only(bottom: insets.bottom + 100),
                  child: Center(
                    child: SizedBox(
                      width: 333,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          _PlanSlider(gold: _gold, onChange: (g) => setState(() => _gold = g)),
                          const SizedBox(height: 28),
                          _PlanCard(gold: _gold),
                          if (!_gold) ...[
                            const SizedBox(height: 28),
                            const _InfoRow(label: 'Type', value: 'Weekly', trailing: _OutlinePill(label: 'Change')),
                            const SizedBox(height: 16),
                            _InfoRow(
                              label: 'Next Renewal Date',
                              value: _formatDate(sub?['currentPeriodEnd'] as String?),
                              trailing: _OutlinePill(
                                key: const ValueKey('subscription_cancel'),
                                label: 'Cancel',
                                onTap: sub == null || cancelled || _busy ? null : _cancel,
                              ),
                            ),
                            const SizedBox(height: 8),
                            Text(
                              'If you cancel, you can keep using your remaining AI credits',
                              style: _funnel.copyWith(fontSize: 14, height: 18 / 14, color: const Color(0xFF666666)),
                            ),
                          ],
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
          if (_gold)
            Positioned(
              left: 20,
              right: 20,
              bottom: insets.bottom + 16,
              child: Container(
                key: const ValueKey('subscription_upgrade'),
                height: 56,
                alignment: Alignment.center,
                decoration: BoxDecoration(color: Colors.black, borderRadius: BorderRadius.circular(99)),
                child: Text('Upgrade to Max Plan', style: _funnel.copyWith(color: Colors.white, fontSize: 16, height: 24 / 16, letterSpacing: -0.24, fontWeight: FontWeight.w500)),
              ),
            ),
        ],
      ),
    );
  }
}

class _PlanSlider extends StatelessWidget {
  const _PlanSlider({required this.gold, required this.onChange});

  final bool gold;
  final ValueChanged<bool> onChange;

  static const double _width = 333 - 40;
  static const double _pad = 4;
  static const double _tab = (_width - _pad * 2) / 2;

  @override
  Widget build(BuildContext context) {
    Widget tab(String label, bool value) => Expanded(
          child: GestureDetector(
            key: ValueKey('plan_${label.toLowerCase()}'),
            behavior: HitTestBehavior.opaque,
            onTap: () => onChange(value),
            child: Center(
              child: Text(
                label,
                style: _funnel.copyWith(
                  fontSize: 16,
                  height: 22 / 16,
                  fontWeight: gold == value ? FontWeight.bold : FontWeight.normal,
                  color: gold == value ? Colors.black : const Color(0xFF666666),
                ),
              ),
            ),
          ),
        );
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 0),
      child: Container(
        width: _width,
        height: 52,
        padding: const EdgeInsets.all(_pad),
        decoration: BoxDecoration(color: const Color(0xFFD9D9D9), borderRadius: BorderRadius.circular(999)),
        child: Stack(
          children: [
            AnimatedPositioned(
              duration: const Duration(milliseconds: 220),
              left: gold ? _tab : 0,
              top: 0,
              bottom: 0,
              width: _tab,
              child: DecoratedBox(
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(999),
                  boxShadow: const [BoxShadow(color: Color(0x1F000000), offset: Offset(0, 1), blurRadius: 2)],
                ),
              ),
            ),
            Row(children: [tab('Chrome', false), tab('Gold', true)]),
          ],
        ),
      ),
    );
  }
}

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
                BoxShadow(color: Color(0x99CEA050), offset: Offset(1, 8), blurRadius: 15, spreadRadius: -4),
                BoxShadow(color: Color(0xB3CEA050), offset: Offset(0, 2), blurRadius: 6, spreadRadius: -2),
                BoxShadow(color: Color(0xCCC2850A), offset: Offset(0, 1), blurRadius: 3),
              ]
            : const [BoxShadow(color: Color(0x14000000), offset: Offset(0, 1), blurRadius: 3)],
      ),
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Image.asset(gold ? 'assets/gold-button.png' : 'assets/pro-button.png', width: 56, height: 60),
              const SizedBox(height: 16),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 8),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(gold ? 'Gold Button' : 'Pro Button', style: _funnel.copyWith(fontSize: 24, height: 28 / 24, letterSpacing: -0.36, fontWeight: FontWeight.bold)),
                    const SizedBox(height: 8),
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.baseline,
                      textBaseline: TextBaseline.alphabetic,
                      children: [
                        Text('\$1', style: _funnel.copyWith(fontSize: 36, height: 40 / 36, letterSpacing: -0.54, fontWeight: FontWeight.bold)),
                        Text('.99', style: _funnel.copyWith(fontSize: 18, height: 22 / 18, letterSpacing: -0.27, fontWeight: FontWeight.bold)),
                        const SizedBox(width: 6),
                        Text('/ week', style: _funnel.copyWith(fontSize: 16, height: 22 / 16, color: const Color(0xFF666666))),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 40),
              for (final f in _planFeatures) ...[
                Padding(padding: const EdgeInsets.symmetric(horizontal: 4), child: _FeatureRow(text: f)),
                if (f != _planFeatures.last) const SizedBox(height: 11),
              ],
            ],
          ),
          if (!gold) Positioned(top: -24, right: -24, child: Image.asset('assets/your-plan.png', width: 49, height: 44)),
        ],
      ),
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
        Image.asset('assets/check.png', width: 20, height: 20, color: Colors.black),
        const SizedBox(width: 11),
        Expanded(
          child: Text.rich(TextSpan(
            style: _funnel.copyWith(fontSize: 14, height: 18 / 14),
            children: [
              for (final (i, p) in parts.indexed)
                if (p == '10 AI credits') ...[
                  WidgetSpan(alignment: PlaceholderAlignment.middle, child: Image.asset('assets/star.png', width: 16, height: 16)),
                  const TextSpan(text: ' '),
                  TextSpan(text: p, style: const TextStyle(fontWeight: FontWeight.bold)),
                ] else
                  TextSpan(text: p, style: i.isOdd ? const TextStyle(fontWeight: FontWeight.bold) : null),
            ],
          )),
        ),
      ],
    );
  }
}

class _InfoRow extends StatelessWidget {
  const _InfoRow({required this.label, required this.value, required this.trailing});

  final String label;
  final String value;
  final Widget trailing;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label, style: _funnel.copyWith(fontSize: 12, height: 16 / 12, color: const Color(0xFF666666))),
              const SizedBox(height: 2),
              Text(value, style: _funnel.copyWith(fontSize: 16, height: 22 / 16)),
            ],
          ),
        ),
        trailing,
      ],
    );
  }
}

class _OutlinePill extends StatelessWidget {
  const _OutlinePill({super.key, required this.label, this.onTap});

  final String label;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(999),
          boxShadow: const [BoxShadow(color: Color(0x1F000000), offset: Offset(0, 1), blurRadius: 2)],
        ),
        child: Text(label, style: _funnel.copyWith(fontSize: 16, height: 22 / 16)),
      ),
    );
  }
}
