import 'dart:ui' show ImageFilter;

import 'package:flutter/material.dart';

const double _rowH = 30;

/// Star plus a vertical stack of stage labels that rolls up to [active]:
/// the active label is bold, neighbours are faded and blurred by distance.
class StageCarousel extends StatelessWidget {
  const StageCarousel({super.key, required this.stages, required this.active, this.visibleRows = 3});

  final List<String> stages;
  final int active;
  final int visibleRows;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Image.asset('assets/star.png', width: 24, height: 24),
        const SizedBox(height: 15),
        SizedBox(
          height: _rowH * visibleRows,
          width: 300,
          child: ClipRect(
            child: TweenAnimationBuilder<double>(
              tween: Tween(end: -active * _rowH),
              duration: const Duration(milliseconds: 400),
              curve: Curves.easeOutCubic,
              builder: (context, dy, _) => Transform.translate(
                offset: Offset(0, dy),
                child: OverflowBox(
                  alignment: Alignment.topCenter,
                  maxHeight: double.infinity,
                  child: Column(
                    children: [
                      for (final (i, label) in stages.indexed)
                        SizedBox(
                          height: _rowH,
                          child: Center(
                            child: i == active
                                ? Text(label, style: const TextStyle(fontFamily: 'FunnelSans', fontWeight: FontWeight.bold, fontSize: 20, height: 24 / 20, letterSpacing: -0.3, color: Colors.black))
                                : ImageFiltered(
                                    imageFilter: ImageFilter.blur(sigmaX: i == active + 1 ? 1 : 2, sigmaY: i == active + 1 ? 1 : 2),
                                    child: Text(label, style: TextStyle(fontFamily: 'FunnelSans', fontWeight: FontWeight.bold, fontSize: 16, letterSpacing: -0.16, color: Colors.black.withValues(alpha: 0.4))),
                                  ),
                          ),
                        ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }
}
