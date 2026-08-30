import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/api/api_exception.dart';
import '../../core/api/api_providers.dart';
import '../../core/api/endpoints.dart';
import '../../core/api/wardrobe_items_provider.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_typography.dart';
import 'brands_provider.dart';
import 'wardrobe_ui_provider.dart';

const List<String> _fitOptions = ['skinny', 'regular', 'relaxed', 'oversize'];
const List<String> _jacketLengths = [
  'cropped',
  'waist',
  'hip',
  'thigh',
  'knee',
  'full-length',
];
const List<String> _pantsLengths = [
  'thigh-shorts',
  'knee-shorts',
  'ankle-length',
  'full-length',
];

String _label(String value) {
  final parts = value.split('-');
  return parts
      .map((p) => p.isEmpty ? p : '${p[0].toUpperCase()}${p.substring(1)}')
      .join(' ');
}

List<Map<String, dynamic>> _colorsOf(Map<String, dynamic> item) {
  final colors = item['colors'];
  if (colors is List) {
    return colors.whereType<Map>().map(Map<String, dynamic>.from).toList();
  }
  return const [];
}

Color? _colorFromHex(String hex) {
  final cleaned = hex.replaceFirst('#', '');
  if (cleaned.length != 6) return null;
  final value = int.tryParse(cleaned, radix: 16);
  if (value == null) return null;
  return Color(0xFF000000 | value);
}

/// Editable state for one processed item in the review flow.
class _ItemEditor {
  _ItemEditor(this.item)
      : name = TextEditingController(text: (item['title'] as String?) ?? ''),
        category = (item['category'] as String?) ?? 'shirt' {
    if (!wardrobeCategories.contains(category)) category = 'shirt';
    fit = item['fit'] as String?;
    length = item['length'] as String?;
  }

  final Map<String, dynamic> item;
  final TextEditingController name;
  final TextEditingController notes = TextEditingController();
  String category;
  String? brand;
  String? fit;
  String? length;

  Map<String, dynamic> toBody() {
    final trimmedName = name.text.trim();
    return {
      'imageUrl': item['processedImageUrl'],
      'originalImageUrl': item['originalImageUrl'],
      'category': category,
      'name': trimmedName.isEmpty
          ? (item['title'] as String? ?? 'Wardrobe item')
          : trimmedName,
      'brand': brand,
      'fit': fit,
      'length': length,
      'customNotes': notes.text.trim().isEmpty ? null : notes.text.trim(),
      'colors': item['colors'] ?? const [],
    };
  }

  void dispose() {
    name.dispose();
    notes.dispose();
  }
}

/// Paged per-item review form. Each page edits one processed item (name,
/// category, searchable brand with custom entry, fit, length, colors bar,
/// notes) and the Save button posts every item via `POST /api/wardrobe/items`
/// before navigating to the wardrobe.
class UploadWardrobeReviewScreen extends ConsumerStatefulWidget {
  const UploadWardrobeReviewScreen({super.key, this.uris, this.prefills});

  final String? uris;
  final String? prefills;

  @override
  ConsumerState<UploadWardrobeReviewScreen> createState() =>
      _UploadWardrobeReviewScreenState();
}

class _UploadWardrobeReviewScreenState
    extends ConsumerState<UploadWardrobeReviewScreen> {
  late final List<_ItemEditor> _editors;
  final PageController _pageController = PageController();
  int _page = 0;
  bool _saving = false;

  static List<Map<String, dynamic>> _parsePrefills(String? raw) {
    if (raw == null || raw.isEmpty) return const [];
    final list = jsonDecode(raw);
    return (list as List).whereType<Map>().map(Map<String, dynamic>.from).toList();
  }

  @override
  void initState() {
    super.initState();
    _editors = [
      for (final item in _parsePrefills(widget.prefills)) _ItemEditor(item),
    ];
  }

  @override
  void dispose() {
    for (final editor in _editors) {
      editor.dispose();
    }
    _pageController.dispose();
    super.dispose();
  }

  void _setCategory(int index, String category) {
    final editor = _editors[index];
    setState(() {
      editor.category = category;
      if (category == 'jacket') {
        if (!_jacketLengths.contains(editor.length)) editor.length = null;
      } else if (category == 'pants') {
        if (!_pantsLengths.contains(editor.length)) editor.length = null;
      } else {
        editor.length = null;
      }
      if (category != 'shirt' && category != 'jacket' && category != 'pants') {
        editor.fit = null;
      }
    });
  }

  Future<void> _pickBrand(int index) async {
    List<String> brands;
    try {
      brands = await ref.read(brandsProvider.future);
    } catch (_) {
      brands = const [];
    }
    if (!mounted) return;
    final selected = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (_) => _BrandSheet(brands: brands),
    );
    if (selected != null && mounted) {
      setState(() => _editors[index].brand = selected);
    }
  }

  Future<void> _save() async {
    setState(() => _saving = true);
    final api = ref.read(apiClientProvider);
    try {
      for (final editor in _editors) {
        await api.post(ApiEndpoints.wardrobeItems, body: editor.toBody());
      }
      ref.invalidate(wardrobeItemsProvider);
      ref.invalidate(brandsProvider);
      if (mounted) context.go('/wardrobe');
    } catch (err) {
      if (!mounted) return;
      setState(() => _saving = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(err is ApiException ? err.message : 'Could not save items'),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.myFitPage,
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 16, 12, 8),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      'Review your items',
                      style: AppTypography.body.copyWith(
                        color: AppColors.textPrimary,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                  IconButton(
                    key: const ValueKey('review_close'),
                    onPressed: () => context.go('/wardrobe'),
                    icon: const Icon(Icons.close,
                        color: AppColors.textPrimary, size: 24),
                  ),
                ],
              ),
            ),
            if (_editors.isEmpty)
              const Expanded(
                child: Center(
                  child: Text('No items to review', style: AppTypography.body),
                ),
              )
            else
              Expanded(
                child: PageView.builder(
                  controller: _pageController,
                  itemCount: _editors.length,
                  onPageChanged: (i) => setState(() => _page = i),
                  itemBuilder: (context, index) => _buildPage(context, index),
                ),
              ),
          ],
        ),
      ),
      bottomNavigationBar: _editors.isEmpty
          ? null
          : _BottomBar(
              page: _page,
              total: _editors.length,
              saving: _saving,
              onPrevious: _page > 0
                  ? () => _pageController.previousPage(
                      duration: const Duration(milliseconds: 200),
                      curve: Curves.easeOut,
                    )
                  : null,
              onNext: _page < _editors.length - 1
                  ? () => _pageController.nextPage(
                      duration: const Duration(milliseconds: 200),
                      curve: Curves.easeOut,
                    )
                  : null,
              onSave: _save,
            ),
    );
  }

  Widget _buildPage(BuildContext context, int index) {
    final editor = _editors[index];
    final colors = _colorsOf(editor.item);
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Photo ${index + 1} of ${_editors.length}',
            style: AppTypography.caption.copyWith(color: AppColors.textMuted),
          ),
          const SizedBox(height: 10),
          _ImagePreview(url: editor.item['processedImageUrl'] as String?),
          const SizedBox(height: 20),
          const _Label('Name'),
          const SizedBox(height: 8),
          TextField(
            key: ValueKey('review_name_$index'),
            controller: editor.name,
            style: AppTypography.body,
            decoration: const InputDecoration(
              hintText: 'Item name',
              filled: true,
              fillColor: Colors.white,
              border: OutlineInputBorder(
                borderSide: BorderSide.none,
                borderRadius: BorderRadius.all(Radius.circular(10)),
              ),
            ),
          ),
          const SizedBox(height: 20),
          const _Label('Category'),
          const SizedBox(height: 8),
          _OptionChips(
            keyPrefix: 'review_category_$index',
            options: wardrobeCategories,
            labels: (option) => wardrobeCategoryLabels[option] ?? option,
            selected: editor.category,
            onSelect: (option) => _setCategory(index, option),
          ),
          const SizedBox(height: 20),
          const _Label('Brand'),
          const SizedBox(height: 8),
          _BrandField(
            key: ValueKey('review_brand_$index'),
            brand: editor.brand,
            onTap: () => _pickBrand(index),
          ),
          if (editor.category == 'shirt' ||
              editor.category == 'jacket' ||
              editor.category == 'pants') ...[
            const SizedBox(height: 20),
            const _Label('Fit'),
            const SizedBox(height: 8),
            _OptionChips(
              keyPrefix: 'review_fit_$index',
              options: _fitOptions,
              labels: _label,
              selected: editor.fit,
              onSelect: (option) => setState(() => editor.fit = option),
            ),
          ],
          if (editor.category == 'jacket' || editor.category == 'pants') ...[
            const SizedBox(height: 20),
            const _Label('Length'),
            const SizedBox(height: 8),
            _OptionChips(
              keyPrefix: 'review_length_$index',
              options: editor.category == 'jacket'
                  ? _jacketLengths
                  : _pantsLengths,
              labels: _label,
              selected: editor.length,
              onSelect: (option) => setState(() => editor.length = option),
            ),
          ],
          if (colors.isNotEmpty) ...[
            const SizedBox(height: 20),
            const _Label('Colors'),
            const SizedBox(height: 8),
            _ColorsBar(colors: colors),
          ],
          const SizedBox(height: 20),
          const _Label('Notes'),
          const SizedBox(height: 8),
          TextField(
            key: ValueKey('review_notes_$index'),
            controller: editor.notes,
            maxLines: 3,
            style: AppTypography.body,
            decoration: const InputDecoration(
              hintText: 'Anything to remember about this item',
              filled: true,
              fillColor: Colors.white,
              border: OutlineInputBorder(
                borderSide: BorderSide.none,
                borderRadius: BorderRadius.all(Radius.circular(10)),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _Label extends StatelessWidget {
  const _Label(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    return Text(
      text,
      style: AppTypography.body.copyWith(color: AppColors.textPrimary),
    );
  }
}

class _ImagePreview extends StatelessWidget {
  const _ImagePreview({required this.url});

  final String? url;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 240,
      width: double.infinity,
      decoration: BoxDecoration(
        color: AppColors.chip,
        borderRadius: BorderRadius.circular(12),
      ),
      clipBehavior: Clip.hardEdge,
      child: url == null
          ? const ColoredBox(color: AppColors.chip)
          : Image.network(
              url!,
              fit: BoxFit.cover,
              loadingBuilder: (context, child, progress) =>
                  progress == null ? child : const ColoredBox(color: AppColors.chip),
              errorBuilder: (context, error, stackTrace) =>
                  const ColoredBox(color: AppColors.chip),
            ),
    );
  }
}

class _BrandField extends StatelessWidget {
  const _BrandField({super.key, required this.brand, required this.onTap});

  final String? brand;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(10),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(10),
        ),
        child: Row(
          children: [
            Expanded(
              child: Text(
                brand ?? 'Select brand',
                style: AppTypography.body.copyWith(
                  color: brand == null ? AppColors.textMuted : AppColors.textPrimary,
                ),
              ),
            ),
            const Icon(Icons.chevron_right, color: AppColors.textMuted, size: 20),
          ],
        ),
      ),
    );
  }
}

class _ColorsBar extends StatelessWidget {
  const _ColorsBar({required this.colors});

  final List<Map<String, dynamic>> colors;

  @override
  Widget build(BuildContext context) {
    final names = colors
        .map((c) => c['name'] as String? ?? '')
        .where((n) => n.isNotEmpty)
        .join(', ');
    return Row(
      children: [
        for (final color in colors)
          Container(
            margin: const EdgeInsets.only(right: 6),
            width: 20,
            height: 20,
            decoration: BoxDecoration(
              color: _colorFromHex(color['hex'] as String? ?? '') ?? AppColors.disabled,
              shape: BoxShape.circle,
              border: Border.all(color: AppColors.hairline),
            ),
          ),
        if (names.isNotEmpty) ...[
          const SizedBox(width: 4),
          Expanded(
            child: Text(
              names,
              style: AppTypography.caption.copyWith(color: AppColors.textSecondary),
            ),
          ),
        ],
      ],
    );
  }
}

class _OptionChips extends StatelessWidget {
  const _OptionChips({
    required this.keyPrefix,
    required this.options,
    required this.labels,
    required this.selected,
    required this.onSelect,
  });

  final String keyPrefix;
  final List<String> options;
  final String Function(String option) labels;
  final String? selected;
  final ValueChanged<String> onSelect;

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        for (final option in options)
          InkWell(
            key: ValueKey('${keyPrefix}_$option'),
            onTap: () => onSelect(option),
            borderRadius: BorderRadius.circular(20),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
              decoration: BoxDecoration(
                color: selected == option ? AppColors.dark : Colors.white,
                borderRadius: BorderRadius.circular(20),
                border: Border.all(
                  color: selected == option ? AppColors.dark : AppColors.hairline,
                ),
              ),
              child: Text(
                labels(option),
                style: AppTypography.caption.copyWith(
                  color: selected == option ? Colors.white : AppColors.textPrimary,
                ),
              ),
            ),
          ),
      ],
    );
  }
}

/// Searchable brand sheet backed by `brandsProvider`, with a custom-entry
/// option that adds whatever the user typed.
class _BrandSheet extends StatefulWidget {
  const _BrandSheet({required this.brands});

  final List<String> brands;

  @override
  State<_BrandSheet> createState() => _BrandSheetState();
}

class _BrandSheetState extends State<_BrandSheet> {
  String _query = '';

  @override
  Widget build(BuildContext context) {
    final q = _query.trim().toLowerCase();
    final filtered =
        widget.brands.where((b) => b.toLowerCase().contains(q)).toList();
    final canAdd = q.isNotEmpty && !filtered.any((b) => b.toLowerCase() == q);
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Padding(
              padding: EdgeInsets.fromLTRB(16, 16, 16, 8),
              child: Text(
                'Select brand',
                style: TextStyle(
                  fontFamily: 'FunnelSans',
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                  color: AppColors.textPrimary,
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: TextField(
                key: const ValueKey('brand_search'),
                onChanged: (value) => setState(() => _query = value),
                decoration: const InputDecoration(
                  hintText: 'Search brands',
                  hintStyle: TextStyle(color: AppColors.textMuted),
                  filled: true,
                  fillColor: AppColors.chip,
                  border: OutlineInputBorder(
                    borderSide: BorderSide.none,
                    borderRadius: BorderRadius.all(Radius.circular(10)),
                  ),
                  isDense: true,
                ),
                style: AppTypography.body,
              ),
            ),
            const SizedBox(height: 8),
            Flexible(
              child: ListView(
                shrinkWrap: true,
                children: [
                  if (canAdd)
                    ListTile(
                      key: const ValueKey('brand_add_custom'),
                      leading: const Icon(Icons.add,
                          color: AppColors.textPrimary),
                      title: Text('Add "${_query.trim()}"',
                          style: AppTypography.body),
                      onTap: () => Navigator.of(context).pop(_query.trim()),
                    ),
                  for (final brand in filtered)
                    ListTile(
                      key: ValueKey('brand_option_$brand'),
                      title: Text(brand, style: AppTypography.body),
                      onTap: () => Navigator.of(context).pop(brand),
                    ),
                  if (filtered.isEmpty && !canAdd)
                    const Padding(
                      padding: EdgeInsets.all(16),
                      child: Text('No brands found', style: AppTypography.body),
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _BottomBar extends StatelessWidget {
  const _BottomBar({
    required this.page,
    required this.total,
    required this.saving,
    required this.onPrevious,
    required this.onNext,
    required this.onSave,
  });

  final int page;
  final int total;
  final bool saving;
  final VoidCallback? onPrevious;
  final VoidCallback? onNext;
  final VoidCallback onSave;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
      decoration: const BoxDecoration(
        color: Colors.white,
        border: Border(top: BorderSide(color: AppColors.hairline)),
      ),
      child: SafeArea(
        top: false,
        child: Row(
          children: [
            _NavButton(
              key: const ValueKey('review_prev'),
              icon: Icons.chevron_left,
              onPressed: onPrevious,
            ),
            const SizedBox(width: 12),
            Expanded(
              child: SizedBox(
                height: 48,
                child: ElevatedButton(
                  key: const ValueKey('review_save'),
                  onPressed: saving ? null : onSave,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.dark,
                    foregroundColor: Colors.white,
                    elevation: 0,
                    shape: const StadiumBorder(),
                  ),
                  child: saving
                      ? const SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(
                              strokeWidth: 2, color: Colors.white),
                        )
                      : Text(
                          total == 1 ? 'Save Item' : 'Save $total Items',
                          style: AppTypography.buttonLabel,
                        ),
                ),
              ),
            ),
            const SizedBox(width: 12),
            _NavButton(
              key: const ValueKey('review_next'),
              icon: Icons.chevron_right,
              onPressed: onNext,
            ),
          ],
        ),
      ),
    );
  }
}

class _NavButton extends StatelessWidget {
  const _NavButton({super.key, required this.icon, required this.onPressed});

  final IconData icon;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    return IconButton(
      onPressed: onPressed,
      icon: Icon(
        icon,
        color: onPressed == null ? AppColors.disabled : AppColors.textPrimary,
        size: 24,
      ),
    );
  }
}