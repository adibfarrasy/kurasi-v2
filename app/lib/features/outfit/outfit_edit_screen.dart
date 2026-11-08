import 'dart:io';
import 'dart:math' as math;
import 'dart:ui' show ImageByteFormat;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:share_plus/share_plus.dart';
import '../../core/api/wardrobe_items_provider.dart';
import '../myfit/outfits_provider.dart';
import '../tryon/slot_strip.dart';
import '../tryon/tone_background.dart';

const List<(String, double)> _ratios = [('9:16', 9 / 16), ('4:5', 4 / 5), ('3:4', 3 / 4), ('1:1', 1)];

const List<(String, String)> _canvasSlots = [
  ('baseId', 'SHIRT'),
  ('headwearId', 'HEADWEAR'),
  ('outerId', 'OUTER'),
  ('bottomId', 'PANTS'),
  ('footwearId', 'FOOTWEAR'),
];

const TextStyle _funnel = TextStyle(fontFamily: 'FunnelSans', color: Colors.black);

/// Share-canvas editor reached from the outfit detail's Share pill: re-frame
/// the look (ratio, backdrop, item cards) then share the rendered PNG.
class OutfitEditScreen extends ConsumerStatefulWidget {
  const OutfitEditScreen({super.key, required this.id});

  final String id;

  @override
  ConsumerState<OutfitEditScreen> createState() => _OutfitEditScreenState();
}

class _OutfitEditScreenState extends ConsumerState<OutfitEditScreen> {
  final _canvasKey = GlobalKey();
  String? _tool;
  double _ratio = 9 / 16;
  String _background = 'warm';
  bool _itemsVisible = true;

  Future<void> _share(String? name) async {
    try {
      final boundary = _canvasKey.currentContext?.findRenderObject() as RenderRepaintBoundary?;
      if (boundary == null) return;
      final image = await boundary.toImage(pixelRatio: MediaQuery.devicePixelRatioOf(context));
      final bytes = await image.toByteData(format: ImageByteFormat.png);
      if (bytes == null) return;
      final dir = await Directory.systemTemp.createTemp('kurasi_share');
      final file = File('${dir.path}/outfit_${widget.id}.png');
      await file.writeAsBytes(bytes.buffer.asUint8List());
      await SharePlus.instance.share(ShareParams(files: [XFile(file.path, mimeType: 'image/png')], title: name ?? 'My fit'));
    } catch (err) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Could not share: $err')));
    }
  }

  @override
  Widget build(BuildContext context) {
    final outfit = (ref.watch(outfitsProvider).valueOrNull ?? const []).whereType<Map>().where((o) => o['id'] == widget.id).firstOrNull;
    final itemsById = <String, Map<String, dynamic>>{
      for (final it in (ref.watch(wardrobeItemsProvider).valueOrNull ?? const []).whereType<Map>()) it['id'] as String? ?? '': Map<String, dynamic>.from(it),
    };
    final slots = [
      for (final (i, (key, label)) in _canvasSlots.indexed)
        (
          i,
          SlotEntry(
            key: label,
            label: label,
            item: switch (itemsById[outfit?[key]]) {
              final it? => SlotItem(imageUrl: it['imageUrl'] as String? ?? '', brand: it['brand'] as String?, aiGenerated: it['owned'] == false),
              null => null,
            },
          ),
        ),
    ];
    final hero = outfit?['heroImageUrl'] as String?;
    final insets = MediaQuery.paddingOf(context);
    const fallback = Image(image: AssetImage('assets/default-man.png'), fit: BoxFit.contain);

    return Scaffold(
      backgroundColor: const Color(0xFFEBEBEB),
      body: Padding(
        padding: EdgeInsets.only(top: insets.top + 8),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            SizedBox(
              height: 56,
              child: Stack(
                children: [
                  const Positioned(
                    left: 0,
                    right: 0,
                    top: 8,
                    child: IgnorePointer(
                      child: Text.rich(
                        TextSpan(style: TextStyle(fontFamily: 'BebasNeue', fontSize: 36, height: 40 / 36, color: Colors.black), children: [
                          TextSpan(text: 'E'),
                          TextSpan(text: 'D', style: TextStyle(fontFamily: 'KirangHaerang', fontSize: 44, height: 40 / 44)),
                          TextSpan(text: 'I'),
                          TextSpan(text: 'T', style: TextStyle(fontFamily: 'KirangHaerang', fontSize: 44, height: 40 / 44)),
                        ]),
                        textAlign: TextAlign.center,
                      ),
                    ),
                  ),
                  Positioned(
                    left: 20,
                    top: 0,
                    bottom: 0,
                    child: GestureDetector(
                      key: const ValueKey('edit_back'),
                      onTap: () => context.pop(),
                      child: Padding(padding: const EdgeInsets.all(8), child: Image.asset('assets/arrow-left.png', width: 24, height: 24)),
                    ),
                  ),
                  if (_tool == null)
                    Positioned(
                      right: 20,
                      top: 0,
                      bottom: 0,
                      child: Center(
                        child: GestureDetector(
                          key: const ValueKey('edit_share'),
                          onTap: () => _share(outfit?['name'] as String?),
                          child: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                            decoration: BoxDecoration(color: Colors.black, borderRadius: BorderRadius.circular(99)),
                            child: const Text('Share', style: TextStyle(fontFamily: 'FunnelSans', fontSize: 14, color: Colors.white)),
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            ),
            Expanded(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(20, 11, 20, 0),
                child: LayoutBuilder(
                  builder: (context, c) {
                    final w = math.min(c.maxWidth, c.maxHeight * _ratio);
                    final h = w / _ratio;
                    const n = 5;
                    final cardScale = math.min(1.0, (w - 24 - 8 * (n - 1)) / (n * 88));
                    Widget canvas = Stack(
                      children: [
                        Positioned.fill(child: hero == null ? fallback : Image.network(hero, fit: BoxFit.contain, errorBuilder: (_, __, ___) => fallback)),
                        if (_itemsVisible)
                          Positioned(
                            left: 12,
                            right: 12,
                            bottom: 36,
                            child: Row(
                              children: [
                                for (final (i, s) in slots) ...[
                                  SizedBox(
                                    width: 88 * cardScale,
                                    height: 100 * cardScale,
                                    child: OverflowBox(
                                      alignment: Alignment.topLeft,
                                      maxWidth: 88,
                                      maxHeight: 100,
                                      child: Transform.scale(scale: cardScale, alignment: Alignment.topLeft, child: SlotCard(entry: s, index: i)),
                                    ),
                                  ),
                                  if (i < n - 1) const SizedBox(width: 8),
                                ],
                              ],
                            ),
                          ),
                      ],
                    );
                    if (_background != 'transparent') canvas = ToneBackground(tone: _background, child: canvas);
                    return Center(
                      child: RepaintBoundary(key: _canvasKey, child: ClipRect(child: SizedBox(width: w, height: h, child: canvas))),
                    );
                  },
                ),
              ),
            ),
            if (_tool == null)
              Padding(
                padding: EdgeInsets.fromLTRB(20, 46, 20, insets.bottom + 16),
                child: Row(
                  children: [
                    _ToolbarItem(label: 'Canvas', icon: 'assets/canvas.png', onTap: () => setState(() => _tool = 'canvas')),
                    _ToolbarItem(label: 'Background', icon: 'assets/Image.png', onTap: () => setState(() => _tool = 'background')),
                    _ToolbarItem(label: 'Items', icon: 'assets/t-shirt-edit.png', onTap: () => setState(() => _tool = 'items')),
                  ],
                ),
              )
            else
              Padding(
                padding: EdgeInsets.only(top: 20, bottom: insets.bottom + 16),
                child: Column(
                  children: [
                    _PanelHeader(
                      icon: switch (_tool) { 'canvas' => 'assets/canvas.png', 'background' => 'assets/Image.png', _ => 'assets/t-shirt-edit.png' },
                      label: switch (_tool) { 'canvas' => 'Canvas', 'background' => 'Background', _ => 'Items' },
                      onSave: () => setState(() => _tool = null),
                    ),
                    switch (_tool) {
                      'canvas' => _Segmented<double>(
                          options: [for (final (l, v) in _ratios) (l, v)],
                          value: _ratio,
                          radius: 40,
                          onChange: (v) => setState(() => _ratio = v),
                        ),
                      'background' => _Segmented<String>(
                          options: const [('Transparent', 'transparent'), ('Neutral', 'neutral'), ('Cool', 'cool'), ('Warm', 'warm')],
                          value: _background,
                          radius: 10,
                          swatches: true,
                          onChange: (v) => setState(() => _background = v),
                        ),
                      _ => _Segmented<bool>(
                          options: const [('Hide', false), ('Show', true)],
                          value: _itemsVisible,
                          radius: 40,
                          onChange: (v) => setState(() => _itemsVisible = v),
                        ),
                    },
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _ToolbarItem extends StatelessWidget {
  const _ToolbarItem({required this.label, required this.icon, required this.onTap});

  final String label;
  final String icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: GestureDetector(
        key: ValueKey('edit_tool_$label'),
        behavior: HitTestBehavior.opaque,
        onTap: onTap,
        child: Column(
          children: [
            Image.asset(icon, width: 28, height: 28, color: const Color(0xFF666666)),
            const SizedBox(height: 6),
            Text(label, style: _funnel.copyWith(fontSize: 12, height: 16 / 12, fontWeight: FontWeight.bold, letterSpacing: 0.06, color: const Color(0xFF666666))),
          ],
        ),
      ),
    );
  }
}

class _PanelHeader extends StatelessWidget {
  const _PanelHeader({required this.icon, required this.label, required this.onSave});

  final String icon;
  final String label;
  final VoidCallback onSave;

  @override
  Widget build(BuildContext context) {
    return CustomPaint(
      painter: _DashedTopBorder(),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 4, 20, 15),
        child: Row(
          children: [
            Image.asset(icon, width: 20, height: 20, color: const Color(0xFF1A1A1A)),
            const SizedBox(width: 8),
            Text(label, style: _funnel.copyWith(fontSize: 16, fontWeight: FontWeight.bold)),
            const Spacer(),
            GestureDetector(
              key: const ValueKey('edit_panel_save'),
              onTap: onSave,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                decoration: BoxDecoration(color: Colors.black, borderRadius: BorderRadius.circular(99)),
                child: Text('Save', style: _funnel.copyWith(fontSize: 14, height: 18 / 14, color: Colors.white)),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _DashedTopBorder extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = const Color(0xFFC8C8C8)
      ..strokeWidth = 1;
    for (var x = 0.0; x < size.width; x += 6) {
      canvas.drawLine(Offset(x, 0), Offset(math.min(x + 3, size.width), 0), paint);
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

/// Grey strip with a white thumb that slides to the selected option.
class _Segmented<T> extends StatelessWidget {
  const _Segmented({required this.options, required this.value, required this.radius, required this.onChange, this.swatches = false});

  final List<(String, T)> options;
  final T value;
  final double radius;
  final bool swatches;
  final ValueChanged<T> onChange;

  static const Map<String, Color> _swatchColors = {'neutral': Color(0xFFF0F0F0), 'cool': Color(0xFFA8C4E0), 'warm': Color(0xFFC9B89D)};

  @override
  Widget build(BuildContext context) {
    final active = options.indexWhere((o) => o.$2 == value);
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20),
      child: Container(
        padding: const EdgeInsets.all(2),
        decoration: BoxDecoration(color: const Color(0xFFD6D6D6), borderRadius: BorderRadius.circular(radius)),
        child: LayoutBuilder(
          builder: (context, c) {
            final cell = (c.maxWidth - 4 * (options.length - 1)) / options.length;
            return Stack(
              children: [
                AnimatedPositioned(
                  duration: const Duration(milliseconds: 250),
                  curve: Curves.easeOutBack,
                  left: active * (cell + 4),
                  top: 0,
                  bottom: 0,
                  width: cell,
                  child: DecoratedBox(decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(radius))),
                ),
                Row(
                  children: [
                    for (final (i, (label, v)) in options.indexed) ...[
                      Expanded(
                        child: GestureDetector(
                          key: ValueKey('edit_option_$label'),
                          behavior: HitTestBehavior.opaque,
                          onTap: () => onChange(v),
                          child: Padding(
                            padding: EdgeInsets.symmetric(vertical: swatches ? 10 : 12),
                            child: Column(
                              children: [
                                if (swatches) ...[
                                  Container(
                                    width: 28,
                                    height: 28,
                                    decoration: v == 'transparent'
                                        ? BoxDecoration(shape: BoxShape.circle, border: Border.all(color: const Color(0xFF9A9A9A), width: 1.5))
                                        : BoxDecoration(
                                            shape: BoxShape.circle,
                                            color: _swatchColors[v],
                                            boxShadow: const [BoxShadow(color: Color(0xA8000000), offset: Offset(0, 0.5), blurRadius: 0.5)],
                                          ),
                                  ),
                                  const SizedBox(height: 6),
                                ],
                                Text(
                                  label,
                                  style: _funnel.copyWith(
                                    fontSize: swatches ? 12 : 14,
                                    height: swatches ? 16 / 12 : 18 / 14,
                                    fontWeight: !swatches || i == active ? FontWeight.bold : FontWeight.normal,
                                    color: i == active ? Colors.black : const Color(0xFF666666),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ),
                      if (i < options.length - 1) const SizedBox(width: 4),
                    ],
                  ],
                ),
              ],
            );
          },
        ),
      ),
    );
  }
}
