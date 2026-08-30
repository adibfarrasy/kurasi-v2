import 'package:flutter/material.dart';

import '../theme/app_colors.dart';
import 'signature_pad.dart';

/// The dark `#1A1A1A` membership card: Bebas name, gold halo accent and the
/// drawn signature rendered from SVG path data. Live-bound to
/// `cardNameProvider` / `signaturePathsProvider`.
class MembershipCardView extends StatelessWidget {
  const MembershipCardView({super.key, required this.name, required this.signaturePaths});

  final String name;
  final List<String> signaturePaths;

  static const Color gold = Color(0xFFD8B45A);

  @override
  Widget build(BuildContext context) {
    final displayName = name.trim().isEmpty ? 'Your Name' : name.trim();
    return Container(
      height: 220,
      decoration: BoxDecoration(
        color: AppColors.dark,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
      ),
      clipBehavior: Clip.antiAlias,
      child: Stack(
        children: [
          const Positioned(
            top: -70,
            right: -50,
            child: _Halo(size: 190, alpha: 0.12),
          ),
          const Positioned(
            top: -24,
            right: 34,
            child: _Halo(size: 84, alpha: 0.22),
          ),
          Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text('KURASI', style: _cardTag),
                    Text('MEMBER', style: _cardTag),
                  ],
                ),
                const Spacer(),
                Text(
                  displayName,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontFamily: 'BebasNeue',
                    fontSize: 34,
                    height: 36 / 34,
                    letterSpacing: 0.5,
                    color: Colors.white,
                  ),
                ),
                const SizedBox(height: 10),
                SizedBox(
                  height: 44,
                  width: double.infinity,
                  child: signaturePaths.isEmpty
                      ? const Text(
                          'Sign below',
                          style: TextStyle(fontFamily: 'FunnelSans', fontSize: 12, color: AppColors.dimText),
                        )
                      : CustomPaint(
                          painter: SignaturePainter(paths: signaturePaths, color: gold, strokeWidth: 1.6),
                        ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _Halo extends StatelessWidget {
  const _Halo({required this.size, required this.alpha});

  final double size;
  final double alpha;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: MembershipCardView.gold.withValues(alpha: alpha),
      ),
    );
  }
}

const TextStyle _cardTag = TextStyle(
  fontFamily: 'BebasNeue',
  fontSize: 12,
  height: 14 / 12,
  letterSpacing: 1.6,
  color: MembershipCardView.gold,
);