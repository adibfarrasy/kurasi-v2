import 'package:flutter/material.dart';
import '../../core/theme/app_colors.dart';

const Set<String> _warmColors = {
  'red', 'orange', 'yellow', 'brown', 'tan', 'rust', 'beige', 'cream',
  'khaki', 'gold', 'pink', 'coral', 'maroon', 'burgundy', 'rose', 'mustard',
  'sand',
};

const Set<String> _coolColors = {
  'blue', 'navy', 'indigo', 'teal', 'cyan', 'purple', 'violet', 'green',
  'mint', 'turquoise', 'sky', 'sage',
};

/// Port of the RN outfit-tone logic: buckets dominant color names into a tone.
///
/// Returns 'neutral' when the warm/cool counts tie or the list is empty.
String outfitTone(List<String> colorNames) {
  var warm = 0;
  var cool = 0;
  for (final raw in colorNames) {
    final name = raw.trim().toLowerCase();
    if (_warmColors.contains(name)) warm++;
    if (_coolColors.contains(name)) cool++;
  }
  if (warm == cool) return 'neutral';
  return warm > cool ? 'warm' : 'cool';
}

/// Full-bleed gradient background tinted by the current outfit tone, with a
/// soft accent glow.
class ToneBackground extends StatelessWidget {
  const ToneBackground({super.key, required this.tone, required this.child});

  final String tone;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final List<Color> colors;
    final Color accent;
    if (tone == 'warm') {
      colors = AppColors.warmGradient;
      accent = AppColors.warmAccent;
    } else if (tone == 'cool') {
      colors = AppColors.coolGradient;
      accent = AppColors.coolAccent;
    } else {
      colors = AppColors.neutralGradient;
      accent = AppColors.neutralAccent;
    }
    return DecoratedBox(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: colors,
        ),
      ),
      child: Stack(
        fit: StackFit.expand,
        children: [
          child,
          Positioned(
            top: -80,
            right: -80,
            child: IgnorePointer(
              child: Container(
                width: 220,
                height: 220,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: RadialGradient(
                    colors: [
                      accent.withValues(alpha: 0.18),
                      accent.withValues(alpha: 0),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}