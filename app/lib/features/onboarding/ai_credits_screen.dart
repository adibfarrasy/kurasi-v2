import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/router.dart' show onboardingCompleteProvider;
import '../../core/api/api_providers.dart';
import '../../core/api/endpoints.dart';
import '../../core/theme/app_colors.dart';

/// Onboarding terminal step 2 — AI credits. Collage placeholder + a Bebas
/// "15 FREE AI CREDITS" medallion; Continue POSTs `/api/onboarding`
/// (complete), sets [onboardingCompleteProvider] and drops the user into
/// `/myfit`.
class AiCreditsScreen extends ConsumerStatefulWidget {
  const AiCreditsScreen({super.key});

  @override
  ConsumerState<AiCreditsScreen> createState() => _AiCreditsScreenState();
}

class _AiCreditsScreenState extends ConsumerState<AiCreditsScreen> {
  bool _submitting = false;

  Future<void> _complete() async {
    if (_submitting) return;
    setState(() => _submitting = true);
    try {
      await ref.read(apiClientProvider).post(ApiEndpoints.onboarding);
    } catch (err) {
      debugPrint('[ai-credits] onboarding.set failed: $err');
    }
    if (!mounted) return;
    ref.read(onboardingCompleteProvider.notifier).set(true);
    context.go('/myfit');
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.dark,
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Expanded(
              child: Stack(
                fit: StackFit.expand,
                children: [
                  _Collage(),
                  Align(alignment: Alignment.center, child: _CreditsMedallion()),
                ],
              ),
            ),
            const Padding(
              padding: EdgeInsets.fromLTRB(30, 0, 30, 20),
              child: Text(
                'Your AI fit engine is ready.',
                textAlign: TextAlign.center,
                style: TextStyle(fontFamily: 'FunnelSans', fontSize: 14, height: 20 / 14, color: AppColors.textOnDark),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(30, 0, 30, 24),
              child: SizedBox(
                height: 56,
                child: ElevatedButton(
                  onPressed: _submitting ? null : _complete,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: _gold,
                    foregroundColor: AppColors.dark,
                    elevation: 0,
                    shape: const StadiumBorder(),
                    textStyle: const TextStyle(fontFamily: 'FunnelSans', fontSize: 16, fontWeight: FontWeight.w600, letterSpacing: -0.24),
                  ),
                  child: const Text('Continue'),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

const Color _gold = Color(0xFFD8B45A);

/// Placeholder collage of the onboarding-credits tiles around the center shot.
class _Collage extends StatelessWidget {
  const _Collage();

  static const _tiles = [
    ('assets/onboarding-credits-tl-coat-man.png', Alignment.topLeft),
    ('assets/onboarding-credits-tr-loafers.png', Alignment.topRight),
    ('assets/onboarding-credits-bl-denim-jacket.png', Alignment.bottomLeft),
    ('assets/onboarding-credits-br-models-pair.png', Alignment.bottomRight),
  ];

  @override
  Widget build(BuildContext context) {
    return Stack(
      fit: StackFit.expand,
      children: [
        Container(
          color: const Color(0xFF141414),
          child: Image.asset('assets/onboarding-credits-center.png', fit: BoxFit.cover),
        ),
        for (final (asset, alignment) in _tiles)
          Align(
            alignment: alignment,
            child: Container(
              margin: const EdgeInsets.all(18),
              width: 90,
              height: 120,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: Colors.white.withValues(alpha: 0.3), width: 2),
              ),
              clipBehavior: Clip.antiAlias,
              child: Image.asset(asset, fit: BoxFit.cover),
            ),
          ),
      ],
    );
  }
}

/// Circular gold-ringed "15 FREE AI CREDITS" badge in Bebas.
class _CreditsMedallion extends StatelessWidget {
  const _CreditsMedallion();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 190,
      height: 190,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: AppColors.dark,
        border: Border.all(color: _gold, width: 3),
        boxShadow: [BoxShadow(color: _gold.withValues(alpha: 0.35), blurRadius: 48, spreadRadius: 2)],
      ),
      child: const Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text('15 FREE', style: _medallionGold),
          Text('AI CREDITS', style: _medallionWhite),
        ],
      ),
    );
  }
}

const TextStyle _medallionGold = TextStyle(fontFamily: 'BebasNeue', fontSize: 44, height: 46 / 44, letterSpacing: 0.5, color: _gold);

const TextStyle _medallionWhite = TextStyle(fontFamily: 'BebasNeue', fontSize: 30, height: 32 / 30, letterSpacing: 1.2, color: Colors.white);