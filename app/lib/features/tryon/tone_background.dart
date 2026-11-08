import 'package:flutter/material.dart';

const Set<String> _warmColors = {
  'red', 'orange', 'yellow', 'brown', 'tan', 'rust', 'beige', 'cream', 'khaki', 'gold', 'pink', 'coral', 'maroon', 'burgundy', //
};

const Set<String> _coolColors = {
  'blue', 'navy', 'indigo', 'teal', 'cyan', 'purple', 'violet', 'green', 'mint', 'turquoise', //
};

/// Buckets an outfit's dominant color names into 'warm' / 'cool' / 'neutral'.
/// Black, white, grey and anything unknown count toward neither side.
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

const Map<String, List<Color>> _gradients = {
  'warm': [Color(0xFFAAA7A1), Color(0xFFCAC7BE)],
  'cool': [Color(0xFF9BABBF), Color(0xFFC9D7E8)],
  'neutral': [Color(0xFFE5E5E5), Color(0xFFE5E5E5)],
};

/// Darker shade per tone for accent text and tinted icons on the gradient.
Color toneAccent(String tone) => switch (tone) {
      'warm' => const Color(0xFF977153),
      'cool' => const Color(0xFF4879B4),
      _ => Colors.black,
    };

class ToneBackground extends StatelessWidget {
  const ToneBackground({super.key, required this.tone, required this.child});

  final String tone;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: _gradients[tone] ?? _gradients['neutral']!,
        ),
      ),
      child: child,
    );
  }
}
