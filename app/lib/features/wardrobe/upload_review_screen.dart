import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/api/api_providers.dart';
import '../../core/api/endpoints.dart';
import '../../core/api/wardrobe_items_provider.dart';
import '../../core/design/flair_sheet.dart';
import 'brands_provider.dart';
import 'wardrobe_ui_provider.dart';

const List<String> _fitOptions = ['skinny', 'regular', 'relaxed', 'oversize'];
const List<String> _jacketLengths = ['cropped', 'waist', 'hip', 'thigh', 'knee', 'full-length'];
const List<String> _pantsLengths = ['thigh-shorts', 'knee-shorts', 'ankle-length', 'full-length'];

const Map<String, String> _lengthLabels = {
  'cropped': 'Cropped',
  'waist': 'Waist',
  'hip': 'Hip',
  'thigh': 'Thigh',
  'knee': 'Knee',
  'full-length': 'Full-length',
  'thigh-shorts': 'Thigh shorts',
  'knee-shorts': 'Knee shorts',
  'ankle-length': 'Ankle length',
};

String _lengthLabel(String v, String category) => category == 'pants' && v == 'full-length' ? 'Full length' : _lengthLabels[v] ?? v;

String _lengthAsset(String v, String category) => category == 'pants'
    ? switch (v) {
        'thigh-shorts' => 'assets/variant-thigh-shorts.png',
        'knee-shorts' => 'assets/variant-knee-shorts.png',
        'ankle-length' => 'assets/variant-ankle-length.png',
        _ => 'assets/variant-full-length-pants.png',
      }
    : 'assets/variant-${_jacketLengths.contains(v) ? v : 'hip'}.png';

String _cap(String v) => v.isEmpty ? v : '${v[0].toUpperCase()}${v.substring(1)}';

bool _hasFit(String category) => category == 'shirt' || category == 'jacket' || category == 'pants';
bool _hasLength(String category) => category == 'jacket' || category == 'pants';

const TextStyle _funnel = TextStyle(fontFamily: 'FunnelSans', color: Colors.black);
const TextStyle _bebas36 = TextStyle(fontFamily: 'BebasNeue', fontSize: 36, height: 40 / 36, color: Colors.black);
const TextStyle _kirang44 = TextStyle(fontFamily: 'KirangHaerang', fontSize: 44, height: 40 / 44, color: Colors.black);

/// Editable state for one processed item.
class _ItemEditor {
  _ItemEditor(this.item)
      : name = TextEditingController(text: (item['title'] as String?) ?? ''),
        category = wardrobeCategories.contains(item['category']) ? item['category'] as String : 'jacket' {
    fit = item['fit'] as String? ?? 'regular';
    length = item['length'] as String? ?? (category == 'pants' ? 'full-length' : 'hip');
  }

  final Map<String, dynamic> item;
  final TextEditingController name;
  final TextEditingController notes = TextEditingController();
  String category;
  String? brand;
  late String fit;
  late String length;

  Map<String, dynamic> toBody() {
    final trimmedName = name.text.trim();
    return {
      'imageUrl': item['processedImageUrl'],
      'originalImageUrl': item['originalImageUrl'],
      'category': category,
      'name': trimmedName.isEmpty ? (item['title'] as String? ?? 'Wardrobe item') : trimmedName,
      'brand': brand,
      'fit': _hasFit(category) ? fit : null,
      'length': _hasLength(category) ? length : null,
      'customNotes': notes.text.trim().isEmpty ? null : notes.text.trim(),
      'colors': item['colors'] ?? const [],
    };
  }

  void dispose() {
    name.dispose();
    notes.dispose();
  }
}

/// Paged per-item review: one processed item per page (name, type, brand,
/// fit, length, colors, notes); Save posts every item then opens Wardrobe.
class UploadWardrobeReviewScreen extends ConsumerStatefulWidget {
  const UploadWardrobeReviewScreen({super.key, this.uris, this.prefills});

  final String? uris;
  final String? prefills;

  @override
  ConsumerState<UploadWardrobeReviewScreen> createState() => _UploadWardrobeReviewScreenState();
}

class _UploadWardrobeReviewScreenState extends ConsumerState<UploadWardrobeReviewScreen> {
  late final List<_ItemEditor> _editors;
  int _page = 0;
  bool _editingName = false;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    final raw = widget.prefills;
    final list = raw == null || raw.isEmpty ? const [] : jsonDecode(raw) as List;
    _editors = [for (final item in list.whereType<Map>()) _ItemEditor(Map<String, dynamic>.from(item))];
  }

  @override
  void dispose() {
    for (final e in _editors) {
      e.dispose();
    }
    super.dispose();
  }

  Future<void> _save() async {
    if (_saving) return;
    setState(() => _saving = true);
    final api = ref.read(apiClientProvider);
    try {
      for (final e in _editors) {
        await api.post(ApiEndpoints.wardrobeItems, body: e.toBody());
      }
      ref.invalidate(wardrobeItemsProvider);
      ref.invalidate(brandsProvider);
      if (mounted) context.go('/wardrobe');
    } catch (err) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Save failed: $err')));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _pickType(_ItemEditor e) async {
    final picked = await _pickOption(
      context,
      title: const [TextSpan(text: 'T', style: _kirang44), TextSpan(text: 'YPE', style: _bebas36)],
      options: wardrobeCategories,
      label: (c) => wardrobeCategoryLabels[c]!,
      initial: e.category,
    );
    if (picked == null) return;
    setState(() {
      // Pants and jackets use different length scales.
      if ((picked == 'pants') != (e.category == 'pants')) e.length = picked == 'pants' ? 'full-length' : 'hip';
      e.category = picked;
    });
  }

  Future<void> _pickFit(_ItemEditor e) async {
    final picked = await _pickOption(
      context,
      title: const [TextSpan(text: 'F', style: _kirang44), TextSpan(text: 'I', style: _bebas36), TextSpan(text: 'T', style: _kirang44)],
      options: _fitOptions,
      label: _cap,
      initial: e.fit,
    );
    if (picked != null) setState(() => e.fit = picked);
  }

  Future<void> _pickLength(_ItemEditor e) async {
    final options = e.category == 'pants' ? _pantsLengths : _jacketLengths;
    final picked = await showFlairSheet<String>(
      context,
      divider: false,
      builder: (_) => _LengthSheet(options: options, category: e.category, initial: options.contains(e.length) ? e.length : options.last),
    );
    if (picked != null) setState(() => e.length = picked);
  }

  Future<void> _pickBrand(_ItemEditor e) async {
    final picked = await showFlairSheet<String>(context, divider: false, builder: (_) => _BrandSheet(initial: e.brand));
    if (picked != null) setState(() => e.brand = picked);
  }

  @override
  Widget build(BuildContext context) {
    final insets = MediaQuery.paddingOf(context);
    if (_editors.isEmpty) {
      return const Scaffold(backgroundColor: Color(0xFFEBEBEB), body: Center(child: Text('Nothing to review')));
    }
    final total = _editors.length;
    final e = _editors[_page];
    final hangs = e.category != 'headwear' && e.category != 'footwear';
    final image = e.item['processedImageUrl'] as String?;
    final width = MediaQuery.sizeOf(context).width;
    final isLast = _page >= total - 1;

    Widget bar(bool left) => Positioned(
          top: 16 + 44,
          left: left ? 0 : null,
          right: left ? null : 0,
          width: width / 2,
          height: 8,
          child: ClipRect(
            child: OverflowBox(
              alignment: left ? Alignment.centerLeft : Alignment.centerRight,
              maxWidth: width,
              child: Image.asset('assets/bar.png', width: width, height: 8, fit: BoxFit.fill),
            ),
          ),
        );

    return Scaffold(
      backgroundColor: const Color(0xFFEBEBEB),
      body: Stack(
        children: [
          ListView(
            key: ValueKey('review_page_$_page'),
            padding: EdgeInsets.only(top: insets.top + 8, bottom: insets.bottom + 120),
            children: [
              Text('${_page + 1} of $total', textAlign: TextAlign.center, style: _funnel.copyWith(fontSize: 14, height: 18 / 14, color: const Color(0xFF444444))),
              const SizedBox(height: 12),
              const Divider(height: 1, thickness: 1, color: Color(0xFFD8D8D8)),
              Padding(
                padding: const EdgeInsets.only(top: 16, bottom: 24),
                child: Stack(
                  alignment: Alignment.topCenter,
                  children: [
                    if (hangs) bar(true),
                    SizedBox(
                      width: 240,
                      height: 320,
                      child: image == null
                          ? Image.asset('assets/default-man.png', fit: BoxFit.contain)
                          : Image.network(image, fit: BoxFit.contain, errorBuilder: (_, __, ___) => const SizedBox()),
                    ),
                    if (hangs) bar(false),
                  ],
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 0, 20, 50),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: _editingName
                              ? TextField(
                                  key: const ValueKey('review_name'),
                                  controller: e.name,
                                  autofocus: true,
                                  cursorColor: Colors.black,
                                  onSubmitted: (_) => setState(() => _editingName = false),
                                  onTapOutside: (_) => setState(() => _editingName = false),
                                  style: _funnel.copyWith(fontSize: 20, height: 26 / 20, letterSpacing: -0.2, fontWeight: FontWeight.bold),
                                  decoration: const InputDecoration(isCollapsed: true, border: InputBorder.none),
                                )
                              : Text(e.name.text, maxLines: 1, overflow: TextOverflow.ellipsis, style: _funnel.copyWith(fontSize: 20, height: 26 / 20, letterSpacing: -0.2, fontWeight: FontWeight.bold)),
                        ),
                        const SizedBox(width: 12),
                        GestureDetector(
                          key: const ValueKey('review_edit_name'),
                          onTap: () => setState(() => _editingName = !_editingName),
                          child: Image.asset('assets/pencil-line.png', width: 20, height: 20, color: Colors.black),
                        ),
                      ],
                    ),
                    const SizedBox(height: 16),
                    _SelectField(label: 'Type', value: wardrobeCategoryLabels[e.category], onTap: () => _pickType(e), fieldKey: 'review_type'),
                    const SizedBox(height: 16),
                    _SelectField(label: 'Brand', value: e.brand, placeholder: 'Select or type here', onTap: () => _pickBrand(e), fieldKey: 'review_brand'),
                    if (_hasFit(e.category)) ...[
                      const SizedBox(height: 16),
                      _SelectField(label: 'Fit', value: _cap(e.fit), onTap: () => _pickFit(e), fieldKey: 'review_fit'),
                    ],
                    if (_hasLength(e.category)) ...[
                      const SizedBox(height: 16),
                      _SelectField(label: 'Length', value: _lengthLabel(e.length, e.category), onTap: () => _pickLength(e), fieldKey: 'review_length'),
                    ],
                    const SizedBox(height: 16),
                    const _FieldLabel('Color'),
                    const SizedBox(height: 8),
                    _ColorBar(colors: (e.item['colors'] as List?)?.whereType<Map>().toList() ?? const []),
                    const SizedBox(height: 16),
                    const _FieldLabel('Describe'),
                    const SizedBox(height: 6),
                    TextField(
                      key: const ValueKey('review_notes'),
                      controller: e.notes,
                      minLines: 4,
                      maxLines: null,
                      cursorColor: Colors.black,
                      style: _funnel.copyWith(fontSize: 14, height: 20 / 14),
                      decoration: const InputDecoration(
                        hintText: 'Tell us what you like and dislike about it. Any special care instructions? Share your thoughts!',
                        hintStyle: TextStyle(color: Color(0xFF999999)),
                        hintMaxLines: 4,
                        filled: true,
                        fillColor: Colors.white,
                        contentPadding: EdgeInsets.symmetric(horizontal: 15, vertical: 12),
                        border: InputBorder.none,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          Positioned(
            left: 0,
            right: 0,
            bottom: 0,
            child: Container(
              color: const Color(0xFFEBEBEB),
              padding: EdgeInsets.fromLTRB(20, 12, 20, insets.bottom + 16),
              child: Row(
                children: [
                  if (_page > 0) ...[
                    GestureDetector(
                      key: const ValueKey('review_back'),
                      onTap: () => setState(() {
                        _page--;
                        _editingName = false;
                      }),
                      child: Container(
                        height: 56,
                        padding: const EdgeInsets.symmetric(horizontal: 20),
                        alignment: Alignment.center,
                        decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(99)),
                        child: Text('Back', style: _funnel.copyWith(fontSize: 16, height: 24 / 16, letterSpacing: -0.24, fontWeight: FontWeight.w500)),
                      ),
                    ),
                    const SizedBox(width: 10),
                  ],
                  Expanded(
                    child: GestureDetector(
                      key: ValueKey(isLast ? 'review_save' : 'review_next'),
                      onTap: isLast
                          ? _save
                          : () => setState(() {
                                _page++;
                                _editingName = false;
                              }),
                      child: Container(
                        height: 56,
                        decoration: BoxDecoration(color: Colors.black, borderRadius: BorderRadius.circular(99)),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            isLast
                                ? Image.asset('assets/check.png', width: 18, height: 18, color: Colors.white)
                                : const Icon(Icons.arrow_forward, size: 18, color: Colors.white),
                            const SizedBox(width: 10),
                            Text(isLast ? 'Save' : 'Next', style: _funnel.copyWith(color: Colors.white, fontSize: 16, height: 24 / 16, letterSpacing: -0.24, fontWeight: FontWeight.w500)),
                          ],
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _FieldLabel extends StatelessWidget {
  const _FieldLabel(this.text);

  final String text;

  @override
  Widget build(BuildContext context) =>
      Text(text, style: _funnel.copyWith(fontSize: 12, height: 16 / 12, letterSpacing: 0.06, color: const Color(0xFF3C3C3C)));
}

class _SelectField extends StatelessWidget {
  const _SelectField({required this.label, required this.value, required this.onTap, required this.fieldKey, this.placeholder});

  final String label;
  final String? value;
  final String? placeholder;
  final VoidCallback onTap;
  final String fieldKey;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _FieldLabel(label),
        const SizedBox(height: 6),
        GestureDetector(
          key: ValueKey(fieldKey),
          onTap: onTap,
          child: Container(
            height: 48,
            color: Colors.white,
            padding: const EdgeInsets.symmetric(horizontal: 15),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    value ?? placeholder ?? '',
                    style: _funnel.copyWith(fontSize: 16, height: 22 / 16, letterSpacing: -0.16, color: value == null ? const Color(0xFF999999) : Colors.black),
                  ),
                ),
                Image.asset('assets/caretdown.png', width: 16, height: 16),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _ColorBar extends StatelessWidget {
  const _ColorBar({required this.colors});

  final List<Map> colors;

  @override
  Widget build(BuildContext context) {
    final segs = [
      for (final c in colors)
        (
          color: Color(0xFF000000 | (int.tryParse((c['hex'] as String? ?? '000000').replaceFirst('#', ''), radix: 16) ?? 0)),
          label: c['name'] as String? ?? '',
          pct: (((c['ratio'] as num?) ?? 0) * 100).round(),
        ),
    ];
    // Rounding drift goes to the dominant color so the legend sums to 100.
    if (segs.isNotEmpty) {
      final drift = 100 - segs.fold<int>(0, (a, s) => a + s.pct);
      segs[0] = (color: segs[0].color, label: segs[0].label, pct: segs[0].pct + drift);
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        ClipRRect(
          borderRadius: BorderRadius.circular(4),
          child: SizedBox(
            height: 10,
            child: ColoredBox(
              color: const Color(0xFFE5E5E5),
              child: Row(children: [for (final s in segs) Expanded(flex: s.pct.clamp(0, 100), child: ColoredBox(color: s.color))]),
            ),
          ),
        ),
        const SizedBox(height: 10),
        Wrap(
          spacing: 16,
          runSpacing: 8,
          children: [
            for (final s in segs)
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    width: 14,
                    height: 14,
                    decoration: BoxDecoration(
                      color: s.color,
                      shape: BoxShape.circle,
                      border: s.color == Colors.white ? Border.all(color: const Color(0xFFCCCCCC)) : null,
                    ),
                  ),
                  const SizedBox(width: 6),
                  Text(s.label, style: _funnel.copyWith(fontSize: 14, height: 18 / 14)),
                  const SizedBox(width: 6),
                  Text('${s.pct}%', style: _funnel.copyWith(fontSize: 14, height: 18 / 14, color: const Color(0xFF888888))),
                ],
              ),
          ],
        ),
      ],
    );
  }
}

Widget _saveButton(VoidCallback onTap, {Key? key}) => GestureDetector(
      key: key,
      onTap: onTap,
      child: Container(
        height: 56,
        decoration: BoxDecoration(color: Colors.black, borderRadius: BorderRadius.circular(99)),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Image.asset('assets/check.png', width: 18, height: 18, color: Colors.white),
            const SizedBox(width: 8),
            Text('Save', style: _funnel.copyWith(color: Colors.white, fontSize: 16, height: 24 / 16, letterSpacing: -0.24, fontWeight: FontWeight.w500)),
          ],
        ),
      ),
    );

Widget _optionLabel(String text, bool selected) => Stack(
      clipBehavior: Clip.none,
      children: [
        Text(
          text,
          style: _funnel.copyWith(
            fontSize: 16,
            height: 22 / 16,
            letterSpacing: -0.16,
            fontWeight: selected ? FontWeight.bold : FontWeight.normal,
            color: selected ? const Color(0xFFFF0D00) : Colors.black,
          ),
        ),
        if (selected) Positioned(left: 0, right: 0, bottom: -4, height: 4, child: Image.asset('assets/underline.png', fit: BoxFit.fill)),
      ],
    );

/// Single-choice list sheet; resolves to the picked value on Save.
Future<String?> _pickOption(
  BuildContext context, {
  required List<InlineSpan> title,
  required List<String> options,
  required String Function(String) label,
  required String initial,
}) {
  return showFlairSheet<String>(
    context,
    divider: false,
    builder: (_) {
      var pending = initial;
      return StatefulBuilder(
        builder: (context, setState) => Padding(
          padding: const EdgeInsets.only(bottom: 24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Padding(padding: const EdgeInsets.fromLTRB(20, 20, 20, 12), child: Text.rich(TextSpan(children: title))),
              const Divider(height: 1, thickness: 1, color: Color(0xFFE5E5E5)),
              for (final opt in options)
                GestureDetector(
                  key: ValueKey('option_$opt'),
                  behavior: HitTestBehavior.opaque,
                  onTap: () => setState(() => pending = opt),
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 18),
                    alignment: Alignment.centerLeft,
                    decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: Color(0xFFE5E5E5)))),
                    child: _optionLabel(label(opt), opt == pending),
                  ),
                ),
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 20, 20, 0),
                child: _saveButton(() => Navigator.of(context).pop(pending), key: const ValueKey('option_save')),
              ),
            ],
          ),
        ),
      );
    },
  );
}

class _LengthSheet extends StatefulWidget {
  const _LengthSheet({required this.options, required this.category, required this.initial});

  final List<String> options;
  final String category;
  final String initial;

  @override
  State<_LengthSheet> createState() => _LengthSheetState();
}

class _LengthSheetState extends State<_LengthSheet> {
  late String _pending = widget.initial;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Padding(
            padding: EdgeInsets.fromLTRB(20, 20, 20, 12),
            child: Text.rich(TextSpan(children: [
              TextSpan(text: 'L', style: _bebas36),
              TextSpan(text: 'E', style: _kirang44),
              TextSpan(text: 'NG', style: _bebas36),
              TextSpan(text: 'T', style: _kirang44),
              TextSpan(text: 'H', style: _bebas36),
            ])),
          ),
          const Divider(height: 1, thickness: 1, color: Color(0xFFE5E5E5)),
          Stack(
            children: [
              Column(
                children: [
                  for (final opt in widget.options)
                    GestureDetector(
                      key: ValueKey('option_$opt'),
                      behavior: HitTestBehavior.opaque,
                      onTap: () => setState(() => _pending = opt),
                      child: Container(
                        constraints: const BoxConstraints(minHeight: 60),
                        padding: const EdgeInsets.fromLTRB(260, 14, 20, 14),
                        alignment: Alignment.topLeft,
                        decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: Color(0xFFE5E5E5)))),
                        child: _optionLabel(_lengthLabel(opt, widget.category), opt == _pending),
                      ),
                    ),
                ],
              ),
              // Figure illustration over the rows' left half.
              Positioned(
                left: 20,
                top: 0,
                bottom: 0,
                width: 220,
                child: IgnorePointer(child: Image.asset(_lengthAsset(_pending, widget.category), fit: BoxFit.contain)),
              ),
            ],
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 20, 20, 0),
            child: _saveButton(() => Navigator.of(context).pop(_pending), key: const ValueKey('option_save')),
          ),
        ],
      ),
    );
  }
}

class _BrandSheet extends ConsumerStatefulWidget {
  const _BrandSheet({required this.initial});

  final String? initial;

  @override
  ConsumerState<_BrandSheet> createState() => _BrandSheetState();
}

class _BrandSheetState extends ConsumerState<_BrandSheet> {
  late String? _pending = widget.initial;
  String _query = '';

  @override
  Widget build(BuildContext context) {
    final brands = ref.watch(brandsProvider).valueOrNull ?? const <String>[];
    final q = _query.trim().toLowerCase();
    final filtered = q.isEmpty ? brands : brands.where((b) => b.toLowerCase().contains(q)).toList();
    final noMatch = q.isNotEmpty && filtered.isEmpty;
    final view = MediaQueryData.fromView(View.of(context));
    return SizedBox(
      height: view.size.height - view.padding.top - 12,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Padding(
            padding: EdgeInsets.fromLTRB(20, 20, 20, 12),
            child: Text.rich(TextSpan(children: [
              TextSpan(text: 'B', style: _bebas36),
              TextSpan(text: 'RA', style: _kirang44),
              TextSpan(text: 'ND', style: _bebas36),
            ])),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
            decoration: const BoxDecoration(color: Colors.white, border: Border.symmetric(horizontal: BorderSide(color: Color(0xFFB0B0B0)))),
            child: Row(
              children: [
                Image.asset('assets/magnifying-glass.png', width: 22, height: 22, color: Colors.black),
                const SizedBox(width: 8),
                Expanded(
                  child: TextField(
                    key: const ValueKey('brand_search'),
                    autocorrect: false,
                    textCapitalization: TextCapitalization.words,
                    cursorColor: const Color(0xFFFF0D00),
                    onChanged: (v) => setState(() => _query = v),
                    style: _funnel.copyWith(fontSize: 16, letterSpacing: -0.16),
                    decoration: const InputDecoration(isCollapsed: true, border: InputBorder.none, hintText: 'Type brand name here', hintStyle: TextStyle(color: Color(0xFF999999))),
                  ),
                ),
              ],
            ),
          ),
          Expanded(
            child: noMatch
                ? Padding(
                    padding: const EdgeInsets.fromLTRB(20, 15, 20, 0),
                    child: Text(
                      'No brand with the matching name was found in our database. Tap the Save button to add “${_query.trim()}” as a new brand.',
                      style: _funnel.copyWith(fontSize: 16, height: 22 / 16, letterSpacing: -0.16, color: const Color(0xFF666666)),
                    ),
                  )
                : ListView(
                    padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
                    keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
                    children: [
                      for (final b in filtered)
                        GestureDetector(
                          key: ValueKey('brand_$b'),
                          behavior: HitTestBehavior.opaque,
                          onTap: () => setState(() => _pending = b),
                          child: Padding(
                            padding: const EdgeInsets.symmetric(vertical: 14),
                            child: Text(
                              b,
                              style: _funnel.copyWith(
                                fontSize: 16,
                                height: 22 / 16,
                                letterSpacing: -0.16,
                                fontWeight: b == _pending ? FontWeight.bold : FontWeight.normal,
                                color: b == _pending ? const Color(0xFFFF0D00) : Colors.black,
                              ),
                            ),
                          ),
                        ),
                    ],
                  ),
          ),
          const Divider(height: 1, thickness: 1, color: Color(0xFFE5E5E5)),
          Padding(
            padding: EdgeInsets.fromLTRB(20, 15, 20, view.padding.bottom + 16),
            // A query with no match saves as a new brand.
            child: _saveButton(() => Navigator.of(context).pop(noMatch ? _query.trim() : _pending), key: const ValueKey('brand_save')),
          ),
        ],
      ),
    );
  }
}
