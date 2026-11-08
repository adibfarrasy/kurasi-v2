import 'package:flutter/material.dart';

/// Parses stroke path data (`M x,y L x,y …`, comma or space separated) into
/// a drawable [Path].
Path parseSvgPath(String data) {
  final path = Path();
  final matches = RegExp(r'([ML])\s*(-?\d+(?:\.\d+)?)[\s,]+(-?\d+(?:\.\d+)?)').allMatches(data);
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

class SignaturePainter extends CustomPainter {
  const SignaturePainter({required this.paths, this.color = Colors.black, this.strokeWidth = 3});

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

/// Drawing surface plus Erase and Save controls. Strokes land in [area]
/// (screen coordinates, 300x180 to match 3x the card's signature box); the
/// surface itself is transparent so the zoomed card shows through. Defaults
/// to a centered area when [area] is null.
class SignaturePad extends StatefulWidget {
  const SignaturePad({super.key, required this.onChanged, this.initial = const [], this.onSave, this.area, this.controlsOpacity = 1});

  final ValueChanged<List<String>> onChanged;
  final List<String> initial;
  final VoidCallback? onSave;
  final Rect? area;
  final double controlsOpacity;

  @override
  State<SignaturePad> createState() => _SignaturePadState();
}

class _SignaturePadState extends State<SignaturePad> {
  late final List<String> _strokes = List.of(widget.initial);

  void _emit() => widget.onChanged(List.of(_strokes));

  String _pt(Offset p) => '${p.dx.toStringAsFixed(1)},${p.dy.toStringAsFixed(1)}';

  @override
  Widget build(BuildContext context) {
    final insets = MediaQuery.paddingOf(context);
    return LayoutBuilder(
      builder: (context, c) {
        final area = widget.area ?? Rect.fromCenter(center: c.biggest.center(Offset.zero), width: signaturePadSize.width, height: signaturePadSize.height);
        return Stack(
          children: [
            Positioned.fromRect(
              rect: area,
              child: GestureDetector(
                key: const ValueKey('signature_canvas'),
                behavior: HitTestBehavior.opaque,
                onPanStart: (d) {
                  setState(() => _strokes.add('M${_pt(d.localPosition)}'));
                  _emit();
                },
                onPanUpdate: (d) {
                  setState(() => _strokes.last = '${_strokes.last} L${_pt(d.localPosition)}');
                  _emit();
                },
                child: CustomPaint(painter: SignaturePainter(paths: List.of(_strokes)), child: const SizedBox.expand()),
              ),
            ),
            Positioned(
              top: area.bottom + 40,
              left: 0,
              right: 0,
              child: Opacity(
                opacity: widget.controlsOpacity,
                child: Center(
                  child: GestureDetector(
                    key: const ValueKey('signature_erase'),
                    onTap: () {
                      setState(_strokes.clear);
                      _emit();
                    },
                    child: Container(
                      padding: const EdgeInsets.fromLTRB(4, 8, 12, 8),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(999),
                        boxShadow: const [BoxShadow(color: Color(0x1A000000), offset: Offset(0, 1), blurRadius: 3)],
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Image.asset('assets/trash.png', width: 24, height: 16),
                          const SizedBox(width: 6),
                          const Text('Erase', style: TextStyle(fontSize: 14, height: 18 / 14, color: Colors.black)),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ),
            if (widget.onSave != null)
              Positioned(
                left: 30,
                right: 30,
                bottom: insets.bottom + 16,
                child: Opacity(
                  opacity: widget.controlsOpacity,
                  child: GestureDetector(
                    key: const ValueKey('signature_save'),
                    onTap: widget.onSave,
                    child: Container(
                      height: 56,
                      alignment: Alignment.center,
                      decoration: BoxDecoration(color: Colors.black.withValues(alpha: 0.9), borderRadius: BorderRadius.circular(999)),
                      child: const Text('Save', style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w500, letterSpacing: -0.24)),
                    ),
                  ),
                ),
              ),
          ],
        );
      },
    );
  }
}

const Size signaturePadSize = Size(300, 180);
