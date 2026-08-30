import 'package:flutter/material.dart';

import '../theme/app_colors.dart';

/// Parses a stroke's SVG path data (`M x y L x y …`) into a drawable [Path].
/// Returns an empty path when the data has no move/line commands.
Path parseSvgPath(String data) {
  final path = Path();
  final matches = RegExp(r'([ML])\s*(-?\d+(?:\.\d+)?)\s*(-?\d+(?:\.\d+)?)').allMatches(data);
  for (final m in matches) {
    final x = double.parse(m.group(2)!);
    final y = double.parse(m.group(3)!);
    if (m.group(1) == 'M') {
      path.moveTo(x, y);
    } else {
      path.lineTo(x, y);
    }
  }
  return path;
}

/// Paints SVG path data strokes. Shared by [SignaturePad] and the
/// membership-card preview.
class SignaturePainter extends CustomPainter {
  const SignaturePainter({required this.paths, this.color = AppColors.textPrimary, this.strokeWidth = 2});

  final List<String> paths;
  final Color color;
  final double strokeWidth;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = strokeWidth
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;
    for (final data in paths) {
      canvas.drawPath(parseSvgPath(data), paint);
    }
  }

  @override
  bool shouldRepaint(covariant SignaturePainter oldDelegate) =>
      oldDelegate.paths != paths || oldDelegate.color != color || oldDelegate.strokeWidth != strokeWidth;
}

/// Freehand signature capture. Pointer gestures accumulate SVG path data —
/// one string per stroke (`M x y` on down, `L x y` on move) matching the RN
/// `signaturePathsAtom` shape — and report them via [onChanged]. Erase clears
/// the pad and reports an empty list.
class SignaturePad extends StatefulWidget {
  const SignaturePad({
    super.key,
    required this.onChanged,
    this.color = AppColors.textPrimary,
    this.strokeWidth = 2,
  });

  final ValueChanged<List<String>> onChanged;
  final Color color;
  final double strokeWidth;

  @override
  State<SignaturePad> createState() => _SignaturePadState();
}

class _SignaturePadState extends State<SignaturePad> {
  final List<String> _strokes = [];

  void _startStroke(Offset position) {
    setState(() => _strokes.add('M ${position.dx} ${position.dy}'));
    widget.onChanged(List.of(_strokes));
  }

  void _extendStroke(Offset position) {
    final updated = List<String>.of(_strokes);
    updated[updated.length - 1] = '${updated.last} L ${position.dx} ${position.dy}';
    setState(() {
      _strokes
        ..clear()
        ..addAll(updated);
    });
    widget.onChanged(updated);
  }

  void _erase() {
    setState(_strokes.clear);
    widget.onChanged(const []);
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Expanded(
          child: Container(
            decoration: BoxDecoration(
              color: AppColors.chip,
              borderRadius: BorderRadius.circular(16),
            ),
            clipBehavior: Clip.antiAlias,
            child: GestureDetector(
              behavior: HitTestBehavior.opaque,
              onPanDown: (details) => _startStroke(details.localPosition),
              onPanUpdate: (details) => _extendStroke(details.localPosition),
              child: CustomPaint(
                painter: SignaturePainter(paths: List.of(_strokes), color: widget.color, strokeWidth: widget.strokeWidth),
                child: const SizedBox.expand(),
              ),
            ),
          ),
        ),
        Align(
          alignment: Alignment.centerRight,
          child: TextButton.icon(
            onPressed: _strokes.isEmpty ? null : _erase,
            icon: const Icon(Icons.refresh, size: 18),
            label: const Text('Erase'),
          ),
        ),
      ],
    );
  }
}