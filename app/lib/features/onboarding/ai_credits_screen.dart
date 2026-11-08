import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/router.dart' show onboardingCompleteProvider;
import '../../core/api/api_providers.dart';
import '../../core/api/endpoints.dart';
import '../../core/theme/app_colors.dart';

/// Onboarding terminal step 2: "15 free AI credits" welcome gift. Continue
/// POSTs `/api/onboarding` (complete), sets [onboardingCompleteProvider] and
/// drops the user into `/myfit`.
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
      backgroundColor: AppColors.onboardPage,
      body: SafeArea(
        child: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const _Collage(),
              const Center(child: _GiftBanner()),
              const Padding(
                padding: EdgeInsets.fromLTRB(30, 24, 30, 0),
                child: Column(
                  children: [
                    Text.rich(
                      TextSpan(
                        style: _bebas,
                        children: [
                          TextSpan(text: '15 FR'),
                          TextSpan(text: 'E', style: _kirang),
                          TextSpan(text: 'E '),
                          TextSpan(text: 'A', style: _kirang),
                          TextSpan(text: 'I CR'),
                          TextSpan(text: 'E', style: _kirang),
                          TextSpan(text: 'DI'),
                          TextSpan(text: 'T', style: _kirang),
                          TextSpan(text: ' FOR YO'),
                          TextSpan(text: 'U', style: _kirang),
                        ],
                      ),
                      textAlign: TextAlign.center,
                    ),
                    SizedBox(height: 20),
                    Text(
                      "Your AI tailor needs AI credits to create your perfect look. Here's a free "
                      "gift from us to kickstart your style journey. Let's get you looking amazing!",
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        fontFamily: 'FunnelSans',
                        fontSize: 14,
                        height: 18 / 14,
                        color: Colors.black,
                        shadows: [Shadow(color: Colors.white, offset: Offset(0, 1), blurRadius: 10)],
                      ),
                    ),
                  ],
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(30, 40, 30, 16),
                child: SizedBox(
                  height: 56,
                  child: ElevatedButton(
                    onPressed: _submitting ? null : _complete,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.black.withValues(alpha: 0.9),
                      foregroundColor: Colors.white,
                      elevation: 0,
                      shape: const StadiumBorder(),
                      textStyle: const TextStyle(fontFamily: 'FunnelSans', fontSize: 16, fontWeight: FontWeight.w500, letterSpacing: -0.24),
                    ),
                    child: const Text("Sweet! Let's go!"),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

const TextStyle _bebas = TextStyle(fontFamily: 'BebasNeue', fontSize: 48, height: 52 / 48, color: Colors.black);
const TextStyle _kirang = TextStyle(fontFamily: 'KirangHaerang', fontSize: 58, height: 52 / 58, color: Colors.black);

/// Corner stickers around the medallion, sized at 1/3 of their 3x source exports.
class _Collage extends StatelessWidget {
  const _Collage();

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 420,
      child: Stack(
        children: [
          _sticker('tl-coat-man', top: 0, left: 0, w: 143, h: 185),
          _sticker('tr-loafers', top: 60, right: 0, w: 138, h: 109),
          _sticker('bl-denim-jacket', top: 200, left: 0, w: 168, h: 182),
          _sticker('br-models-pair', top: 180, right: 0, w: 149, h: 205),
          Positioned(
            top: 160,
            left: 0,
            right: 0,
            child: Center(
              child: Image.asset('assets/onboarding-credits-center.png', width: 146, height: 98, fit: BoxFit.contain),
            ),
          ),
        ],
      ),
    );
  }

  static Widget _sticker(String name, {required double top, double? left, double? right, required double w, required double h}) {
    return Positioned(
      top: top,
      left: left,
      right: right,
      child: Image.asset('assets/onboarding-credits-$name.png', width: w, height: h, fit: BoxFit.contain),
    );
  }
}

class _GiftBanner extends StatelessWidget {
  const _GiftBanner();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      decoration: const BoxDecoration(
        color: Colors.white,
        boxShadow: [BoxShadow(color: Color(0x14000000), offset: Offset(0, 1), blurRadius: 2)],
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Text(
            'Welcome gift from',
            style: TextStyle(fontFamily: 'FunnelSans', fontSize: 12, height: 16 / 12, letterSpacing: 0.06, color: Colors.black),
          ),
          const SizedBox(width: 8),
          Image.asset('assets/logomark-dark.png', width: 72, height: 24, fit: BoxFit.contain),
        ],
      ),
    );
  }
}
