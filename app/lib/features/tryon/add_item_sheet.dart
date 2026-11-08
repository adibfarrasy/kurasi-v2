import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/api/wardrobe_items_provider.dart';
import '../../core/design/flair_sheet.dart';
import '../wardrobe/wardrobe_ui_provider.dart';

/// Selection value meaning "use the AI item" for a category.
const String aiKey = '__ai__';

List<double>? _hexToLab(String hex) {
  final cleaned = hex.replaceFirst('#', '').trim();
  if (cleaned.length != 6) return null;
  final v = int.tryParse(cleaned, radix: 16);
  if (v == null) return null;
  double lin(int ch) {
    final c = ch / 255;
    return c > 0.04045 ? math.pow((c + 0.055) / 1.055, 2.4).toDouble() : c / 12.92;
  }

  final r = lin((v >> 16) & 0xFF), g = lin((v >> 8) & 0xFF), b = lin(v & 0xFF);
  final x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
  final y = r * 0.2126 + g * 0.7152 + b * 0.0722;
  final z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
  double f(double t) => t > 0.008856 ? math.pow(t, 1 / 3).toDouble() : 7.787 * t + 16 / 116;
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

List<double>? _centroid(List<dynamic> colors) {
  final sum = [0.0, 0.0, 0.0];
  var total = 0.0;
  for (final c in colors.whereType<Map>()) {
    final lab = _hexToLab(c['hex'] as String? ?? '');
    if (lab == null) continue;
    final w = (c['ratio'] as num?)?.toDouble() ?? 1.0;
    for (var i = 0; i < 3; i++) {
      sum[i] += lab[i] * w;
    }
    total += w;
  }
  return total <= 0 ? null : [for (final s in sum) s / total];
}

/// Perceptual palette similarity in 0..1: ratio-weighted CIELAB centroids,
/// ΔE76 scaled so ΔE >= 60 scores 0 (white vs cream ~5, white vs grey ~30).
double colorSimilarity(List<dynamic> a, List<dynamic> b) {
  final la = _centroid(a), lb = _centroid(b);
  if (la == null || lb == null) return 0;
  final d = math.sqrt([for (var i = 0; i < 3; i++) math.pow(la[i] - lb[i], 2)].reduce((x, y) => x + y));
  return math.max(0, 1 - d / 60);
}

String similarityBucket(double s) => s >= 0.9 ? 'identical' : (s >= 0.5 ? 'alternative' : 'other');

/// Opens the try-on picker on [initialCategory]. [aiItems] maps a category
/// to its steal-the-look item (`imageUrl`, `title`, `colors`). Resolves to
/// the confirmed selections (category to wardrobe id or [aiKey]), or null
/// when dismissed.
Future<Map<String, String>?> showAddItemSheet(
  BuildContext context, {
  Map<String, String> initial = const {},
  Map<String, Map<String, dynamic>> aiItems = const {},
  String initialCategory = 'headwear',
}) {
  return showFlairSheet<Map<String, String>>(
    context,
    divider: false,
    builder: (_) => AddItemSheet(initial: initial, aiItems: aiItems, initialCategory: initialCategory),
  );
}

const TextStyle _funnel = TextStyle(fontFamily: 'FunnelSans', color: Colors.black);
const TextStyle _bebas36 = TextStyle(fontFamily: 'BebasNeue', fontSize: 36, height: 40 / 36, color: Colors.black);
const TextStyle _kirang44 = TextStyle(fontFamily: 'KirangHaerang', fontSize: 44, height: 40 / 44, color: Colors.black);

class AddItemSheet extends ConsumerStatefulWidget {
  const AddItemSheet({super.key, required this.initial, required this.aiItems, required this.initialCategory});

  final Map<String, String> initial;
  final Map<String, Map<String, dynamic>> aiItems;
  final String initialCategory;

  @override
  ConsumerState<AddItemSheet> createState() => _AddItemSheetState();
}

class _AddItemSheetState extends ConsumerState<AddItemSheet> {
  late String _active = widget.initialCategory;
  late final Map<String, String> _selections = Map.of(widget.initial);

  void _toggle(String value) => setState(() {
        if (_selections[_active] == value) {
          _selections.remove(_active);
        } else {
          _selections[_active] = value;
        }
      });

  Future<void> _confirmReset() async {
    final yes = await showFlairSheet<bool>(context, builder: (_) => const _ResetConfirm());
    if (yes == true) setState(_selections.clear);
  }

  @override
  Widget build(BuildContext context) {
    final items = (ref.watch(wardrobeItemsProvider).valueOrNull ?? const [])
        .whereType<Map>()
        .map(Map<String, dynamic>.from)
        // Unowned rows (AI items promoted by saved outfits) aren't wardrobe matches.
        .where((i) => i['category'] == _active && i['owned'] == true)
        .toList();
    final ai = widget.aiItems[_active];
    final inStealMode = widget.aiItems.isNotEmpty;
    final palette = ai?['colors'] as List?;
    final buckets = <String, List<Map<String, dynamic>>>{'identical': [], 'alternative': [], 'other': []};
    for (final it in items) {
      final bucket = palette == null ? 'other' : similarityBucket(colorSimilarity(palette, it['colors'] as List? ?? const []));
      buckets[bucket]!.add(it);
    }
    final tabLabel = wardrobeCategoryLabels[_active]!;
    final hasSelection = _selections.isNotEmpty;
    final bottomInset = MediaQuery.paddingOf(context).bottom;

    Widget tile(Map<String, dynamic> it) {
      final selected = _selections[_active] == it['id'];
      return GestureDetector(
        key: ValueKey('add_item_${it['id']}'),
        onTap: () => _toggle(it['id'] as String),
        child: Container(
          width: 100,
          height: 100,
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(4),
            boxShadow: const [BoxShadow(color: Color(0x1A000000), offset: Offset(0, 1), blurRadius: 2)],
          ),
          child: Stack(
            clipBehavior: Clip.none,
            children: [
              Positioned.fill(child: Image.network(it['imageUrl'] as String? ?? '', fit: BoxFit.contain, errorBuilder: (_, __, ___) => const SizedBox())),
              if (selected) Positioned(left: -5, top: -5, child: Image.asset('assets/ellipse-select.png', width: 110, height: 110)),
            ],
          ),
        ),
      );
    }

    final upload = GestureDetector(
      onTap: () {
        final router = GoRouter.of(context);
        Navigator.of(context).pop();
        router.push('/upload-wardrobe-guide');
      },
      child: SizedBox(
        width: 100,
        height: 100,
        child: Stack(
          children: [
            Positioned.fill(child: Image.asset('assets/itembox.png', fit: BoxFit.fill)),
            Center(
              child: Padding(
                padding: const EdgeInsets.all(8),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Image.asset('assets/coat-hanger.png', width: 24, height: 24),
                    const SizedBox(height: 4),
                    Text('Upload new $tabLabel', textAlign: TextAlign.center, style: _funnel.copyWith(fontSize: 10, height: 1.2, color: const Color(0xFF3C3C3C))),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );

    Widget grid(List<Widget> children) => Padding(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 4),
          child: Wrap(spacing: 12, runSpacing: 12, children: children),
        );

    Widget section(String label, List<Map<String, dynamic>> list) => Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 8),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(color: const Color(0xFFEEEEEE), borderRadius: BorderRadius.circular(4)),
                child: Text(label, style: _funnel.copyWith(fontSize: 14, height: 18 / 14, letterSpacing: -0.14)),
              ),
            ),
            grid([for (final it in list) tile(it)]),
          ],
        );

    return SizedBox(
      height: MediaQuery.sizeOf(context).height * 0.8,
      child: Stack(
        children: [
          ListView(
            padding: const EdgeInsets.only(bottom: 110),
            children: [
              const Padding(
                padding: EdgeInsets.fromLTRB(20, 24, 20, 12),
                child: Text.rich(TextSpan(children: [
                  TextSpan(text: 'T', style: _kirang44),
                  TextSpan(text: 'RY O', style: _bebas36),
                  TextSpan(text: 'N', style: _kirang44),
                ])),
              ),
              SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.fromLTRB(20, 0, 20, 12),
                child: Row(
                  children: [
                    for (final c in wardrobeCategories) ...[
                      _CategoryTab(
                        label: wardrobeCategoryLabels[c]!,
                        active: c == _active,
                        hasItem: _selections.containsKey(c),
                        // Slots the AI didn't fill have nothing to bucket against.
                        struck: inStealMode && !widget.aiItems.containsKey(c),
                        onTap: () => setState(() => _active = c),
                      ),
                      if (c != wardrobeCategories.last) const SizedBox(width: 16),
                    ],
                  ],
                ),
              ),
              const Divider(height: 1, thickness: 1, color: Color(0xFFE5E5E5)),
              if (ai != null) ...[
                Padding(
                  padding: const EdgeInsets.fromLTRB(20, 8, 12, 8),
                  child: Text.rich(TextSpan(
                    style: _funnel.copyWith(fontSize: 12, height: 16 / 12, letterSpacing: 0.06),
                    children: [
                      const TextSpan(text: 'AI generated', style: TextStyle(fontStyle: FontStyle.italic)),
                      TextSpan(text: ' • ${ai['title'] ?? ''}'),
                    ],
                  )),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(20, 0, 20, 11),
                  child: Align(
                    alignment: Alignment.centerLeft,
                    child: GestureDetector(
                      onTap: () => _toggle(aiKey),
                      child: SizedBox(
                        width: 110,
                        height: 110,
                        child: Stack(
                          clipBehavior: Clip.none,
                          children: [
                            Positioned.fill(child: Image.network(ai['imageUrl'] as String? ?? '', fit: BoxFit.contain, errorBuilder: (_, __, ___) => const SizedBox())),
                            if (_selections[_active] == aiKey)
                              Positioned(left: -5, top: -5, child: Image.asset('assets/ellipse-select.png', width: 120, height: 120)),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
                const Divider(height: 1, thickness: 1, color: Color(0xFFE5E5E5)),
              ],
              if (palette == null)
                Padding(
                  padding: const EdgeInsets.only(top: 16),
                  child: grid([upload, for (final it in buckets['other']!) tile(it)]),
                )
              else ...[
                if (buckets['identical']!.isEmpty && buckets['alternative']!.isEmpty)
                  Padding(
                    padding: const EdgeInsets.fromLTRB(20, 16, 20, 4),
                    child: Text("You don't have any similar item in your wardrobe.", style: _funnel.copyWith(fontSize: 16, height: 22 / 16, letterSpacing: -0.16)),
                  ),
                if (buckets['identical']!.isNotEmpty) section('${buckets['identical']!.length} identical items', buckets['identical']!),
                if (buckets['alternative']!.isNotEmpty) section('${buckets['alternative']!.length} alternative items', buckets['alternative']!),
                if (buckets['other']!.isNotEmpty) section('All $tabLabel you have', buckets['other']!),
              ],
            ],
          ),
          if (hasSelection)
            Positioned(
              left: 0,
              right: 0,
              bottom: 0,
              child: Container(
                padding: EdgeInsets.fromLTRB(20, 12, 20, bottomInset + 16),
                decoration: const BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [Color(0x00FFFFFF), Colors.white],
                    stops: [0, 0.15],
                  ),
                ),
                child: Row(
                  children: [
                    GestureDetector(
                      key: const ValueKey('add_item_reset'),
                      onTap: _confirmReset,
                      child: Container(
                        height: 56,
                        padding: const EdgeInsets.symmetric(horizontal: 12),
                        child: Row(
                          children: [
                            Image.asset('assets/reset.png', width: 20, height: 20, color: Colors.black),
                            const SizedBox(width: 8),
                            Text('Reset', style: _funnel.copyWith(fontSize: 16, height: 22 / 16, letterSpacing: -0.16, fontWeight: FontWeight.w500)),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(child: _BlackButton(key: const ValueKey('add_item_done'), label: 'Done', onTap: () => Navigator.of(context).pop(_selections))),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _CategoryTab extends StatelessWidget {
  const _CategoryTab({required this.label, required this.active, required this.hasItem, required this.struck, required this.onTap});

  final String label;
  final bool active;
  final bool hasItem;
  final bool struck;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final color = struck
        ? const Color(0xFF999999)
        : active
            ? const Color(0xFFFF0D00)
            : hasItem
                ? Colors.black
                : const Color(0xFF666666);
    return GestureDetector(
      key: ValueKey('add_item_tab_$label'),
      onTap: struck ? null : onTap,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Stack(
            clipBehavior: Clip.none,
            children: [
              Text(
                label,
                style: _funnel.copyWith(
                  fontSize: 16,
                  height: 22 / 16,
                  letterSpacing: -0.16,
                  color: color,
                  fontWeight: active ? FontWeight.bold : FontWeight.normal,
                  decoration: struck ? TextDecoration.lineThrough : null,
                ),
              ),
              if (active) Positioned(left: 0, right: 0, bottom: -2, height: 4, child: Image.asset('assets/tab-underline.png', fit: BoxFit.fill)),
            ],
          ),
          if (hasItem) ...[
            const SizedBox(width: 2),
            Padding(
              padding: const EdgeInsets.only(top: 2),
              child: Image.asset('assets/checkcircle.png', width: 12, height: 12, color: active ? const Color(0xFFFF0D00) : Colors.black),
            ),
          ],
        ],
      ),
    );
  }
}

class _BlackButton extends StatelessWidget {
  const _BlackButton({super.key, required this.label, required this.onTap});

  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        height: 56,
        alignment: Alignment.center,
        decoration: BoxDecoration(color: Colors.black, borderRadius: BorderRadius.circular(99)),
        child: Text(label, style: const TextStyle(fontFamily: 'FunnelSans', fontSize: 16, height: 24 / 16, letterSpacing: -0.24, fontWeight: FontWeight.w500, color: Colors.white)),
      ),
    );
  }
}

class _ResetConfirm extends StatelessWidget {
  const _ResetConfirm();

  @override
  Widget build(BuildContext context) {
    const divider = Divider(height: 1, thickness: 1, color: Color(0xFFE5E5E5));
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const Padding(
          padding: EdgeInsets.fromLTRB(20, 24, 20, 15),
          child: Text.rich(TextSpan(children: [
            TextSpan(text: 'R', style: _bebas36),
            TextSpan(text: 'E', style: _kirang44),
            TextSpan(text: 'SE', style: _bebas36),
            TextSpan(text: 'T', style: _kirang44),
            TextSpan(text: ' T', style: _bebas36),
            TextSpan(text: 'H', style: _kirang44),
            TextSpan(text: 'E ', style: _bebas36),
            TextSpan(text: 'F', style: _kirang44),
            TextSpan(text: 'IT', style: _bebas36),
          ])),
        ),
        divider,
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 15),
          child: Text('Resetting will restore all five categories to default. Proceed?', style: _funnel.copyWith(fontSize: 16, height: 22 / 16, letterSpacing: -0.16)),
        ),
        divider,
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 15, 20, 50),
          child: Row(
            children: [
              Expanded(
                child: GestureDetector(
                  onTap: () => Navigator.of(context).pop(false),
                  child: Container(
                    height: 56,
                    alignment: Alignment.center,
                    color: Colors.transparent,
                    child: Text('No, Cancel', style: _funnel.copyWith(fontSize: 16, height: 22 / 16, letterSpacing: -0.16)),
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(child: _BlackButton(label: 'Yes, Reset', onTap: () => Navigator.of(context).pop(true))),
            ],
          ),
        ),
      ],
    );
  }
}
