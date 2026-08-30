import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme/app_colors.dart';

/// Onboarding screen 2 — static marketing: `#999` "Strava-like UI"
/// placeholder with logomark overlay, Bebas headline with Kirang accent
/// letters, and a Continue button → `/onboarding-3`.
class OnboardingTwoScreen extends StatelessWidget {
  const OnboardingTwoScreen({super.key});

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
                    const _VideoPlaceholder(caption: '(Strava-like UI)'),
                    const Padding(
                      padding: EdgeInsets.symmetric(horizontal: 30, vertical: 32),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text.rich(
                            TextSpan(
                              style: _bebas,
                              children: [
                                TextSpan(text: 'Show O'),
                                TextSpan(text: 'F', style: _kirang),
                                TextSpan(text: 'f Yo'),
                                TextSpan(text: 'U', style: _kirang),
                                TextSpan(text: 'r Fit of t'),
                                TextSpan(text: 'H', style: _kirang),
                                TextSpan(text: 'e d'),
                                TextSpan(text: 'a'),
                                TextSpan(text: 'y'),
                              ],
                            ),
                          ),
                          SizedBox(height: 16),
                          Text(
                            'Share your style to your friends on social media',
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
                        child: _ContinueButton(onPressed: () => context.go('/onboarding-3')),
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