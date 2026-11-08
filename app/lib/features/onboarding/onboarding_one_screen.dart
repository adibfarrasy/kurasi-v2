import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme/app_colors.dart';

/// Onboarding screen 1 — static marketing: `#999` video placeholder with
/// logomark overlay, Bebas headline with Kirang accent letters, and a
/// Continue button → `/onboarding-2`.
class OnboardingOneScreen extends StatelessWidget {
  const OnboardingOneScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      body: SafeArea(
        child: LayoutBuilder(
          builder: (context, constraints) => SingleChildScrollView(
            child: ConstrainedBox(
              constraints: BoxConstraints(minHeight: constraints.maxHeight),
              child: IntrinsicHeight(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const _VideoPlaceholder(
                      caption: "(video = person's digital avatar, changing between 5 very "
                          'distinct fashion style—same face, same pose)',
                    ),
                    const Padding(
                      padding: EdgeInsets.symmetric(horizontal: 30, vertical: 32),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text.rich(
                            TextSpan(
                              style: _bebas,
                              children: [
                                TextSpan(text: 'Find Yo'),
                                TextSpan(text: 'U', style: _kirang),
                                TextSpan(text: 'r Sign'),
                                TextSpan(text: 'A', style: _kirang),
                                TextSpan(text: 'TUre S'),
                                TextSpan(text: 'T', style: _kirang),
                                TextSpan(text: 'yle'),
                              ],
                            ),
                          ),
                          SizedBox(height: 16),
                          Text(
                            'See how outfits look on your body with AI-powered fit generation',
                            style: _body,
                          ),
                        ],
                      ),
                    ),
                    const Spacer(),
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 30),
                      child: Padding(
                        padding: const EdgeInsets.only(bottom: 16),
                        child: _ContinueButton(onPressed: () => context.push('/onboarding-2')),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _VideoPlaceholder extends StatelessWidget {
  const _VideoPlaceholder({required this.caption});

  final String caption;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 381,
      child: Stack(
        children: [
          Container(
            color: AppColors.dimText,
            padding: const EdgeInsets.symmetric(horizontal: 40),
            alignment: Alignment.center,
            child: Text(
              caption,
              textAlign: TextAlign.center,
              style: const TextStyle(
                fontFamily: 'FunnelSans',
                fontSize: 16,
                fontWeight: FontWeight.w500,
                letterSpacing: -0.24,
                height: 22 / 16,
                color: Colors.white,
              ),
            ),
          ),
          Positioned(
            top: 50,
            left: 0,
            right: 0,
            child: Image.asset(
              'assets/logomark.png',
              width: 52,
              height: 20,
              fit: BoxFit.contain,
            ),
          ),
        ],
      ),
    );
  }
}

class _ContinueButton extends StatelessWidget {
  const _ContinueButton({required this.onPressed});

  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 56,
      child: ElevatedButton(
        onPressed: onPressed,
        style: ElevatedButton.styleFrom(
          backgroundColor: AppColors.dark,
          foregroundColor: Colors.white,
          elevation: 0,
          shape: const StadiumBorder(),
          textStyle: const TextStyle(
            fontFamily: 'FunnelSans',
            fontSize: 16,
            fontWeight: FontWeight.w500,
            letterSpacing: -0.24,
          ),
        ),
        child: const Text('Continue'),
      ),
    );
  }
}

const TextStyle _bebas = TextStyle(
  fontFamily: 'BebasNeue',
  fontSize: 48,
  height: 52 / 48,
  color: AppColors.textPrimary,
);

const TextStyle _kirang = TextStyle(
  fontFamily: 'KirangHaerang',
  fontSize: 58,
  height: 52 / 58,
  color: AppColors.textPrimary,
);

const TextStyle _body = TextStyle(
  fontFamily: 'FunnelSans',
  fontSize: 16,
  height: 22 / 16,
  letterSpacing: -0.16,
  color: AppColors.textPrimary,
);