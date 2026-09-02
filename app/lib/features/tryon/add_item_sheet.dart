import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api/wardrobe_items_provider.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_typography.dart';
import '../wardrobe/wardrobe_screen.dart';
import '../wardrobe/wardrobe_ui_provider.dart';
import 'slot_strip.dart';

class LabColor {
  const LabColor(this.l, this.a, this.b);

  final double l;
  final double a;
  final double b;

  double deltaE(LabColor other) {
    final dl = l - other.l;
    final da = a - other.a;
    final db = b - other.b;
    return math.sqrt(dl * dl + da * da + db * db);
  }
}

LabColor? _hexToLab(String hex) {
  final cleaned = hex.replaceFirst('#', '').trim();
  if (cleaned.length != 6) return null;
  final value = int.tryParse(cleaned, radix: 16);
  if (value == null) return null;
  return _rgbToLab((value >> 16) & 0xFF, (value >> 8) & 0xFF, value & 0xFF);
}

LabColor? _rgbToLab(int r, int g, int b) {
  double linear(double channel) {
    final c = channel / 255;
    return c > 0.04045
        ? math.pow((c + 0.055) / 1.055, 2.4).toDouble()
        : c / 12.92;
  }

  final rl = linear(r.toDouble());
  final gl = linear(g.toDouble());
  final bl = linear(b.toDouble());
  final x = (rl * 0.4124 + gl * 0.3576 + bl * 0.1805) / 0.95047;
  final y = (rl * 0.2126 + gl * 0.7152 + bl * 0.0722) / 1.0;
  final z = (rl * 0.0193 + gl * 0.1192 + bl * 0.9505) / 1.08883;

  double pivot(double t) =>
      t > 0.008856 ? math.pow(t, 1 / 3).toDouble() : (7.787 * t) + 16 / 116;

  final fx = pivot(x);
  final fy = pivot(y);
  final fz = pivot(z);
  return LabColor(116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz));
}

/// Ratio-weighted CIELAB centroid for an item's color list.
LabColor? _colorCentroid(List<Map<String, dynamic>> colors) {
  var l = 0.0;
  var a = 0.0;
  var b = 0.0;
  var total = 0.0;
  for (final color in colors) {
    final hex = color['hex'] as String?;
    if (hex == null) continue;
    final ratio = (color['ratio'] as num?)?.toDouble() ?? 1.0;
    final lab = _hexToLab(hex);
    if (lab == null) continue;
    l += lab.l * ratio;
    a += lab.a * ratio;
    b += lab.b * ratio;
    total += ratio;
  }
  if (total <= 0) return null;
  return LabColor(l / total, a / total, b / total);
}

List<Map<String, dynamic>> _colorsOf(Map<String, dynamic> item) {
  final colors = item['colors'];
  if (colors is List) {
    return colors.whereType<Map>().map(Map<String, dynamic>.from).toList();
  }
  return const [];
}

/// Port of the RN color-similarity helper: CIELAB centroid ΔE76 mapped to a
/// 0..1 score (ΔE 0 → 1, ΔE 100 → 0).
double colorSimilarity(
  List<Map<String, dynamic>> a,
  List<Map<String, dynamic>> b,
) {
  final ca = _colorCentroid(a);
  final cb = _colorCentroid(b);
  if (ca == null || cb == null) return 0;
  return (1 - ca.deltaE(cb) / 100).clamp(0.0, 1.0);
}

typedef ColorBucket = ({String? label, List<Map<String, dynamic>> items});

/// Buckets [items] by color similarity to [reference]: >= 0.9 → 'Same color',
/// >= 0.5 → 'Alternatives', otherwise 'Other'. Without a reference the whole
/// list is returned as a single unlabeled bucket.
List<ColorBucket> bucketItemsByColor(
  List<Map<String, dynamic>> items,
  List<Map<String, dynamic>>? reference,
) {
  if (reference == null || reference.isEmpty || items.isEmpty) {
    return [(label: null, items: items)];
  }
  final same = <Map<String, dynamic>>[];
  final alt = <Map<String, dynamic>>[];
  final other = <Map<String, dynamic>>[];
  for (final item in items) {
    final sim = colorSimilarity(_colorsOf(item), reference);
    if (sim >= 0.9) {
      same.add(item);
    } else if (sim >= 0.5) {
      alt.add(item);
    } else {
      other.add(item);
    }
  }
  return [
    if (same.isNotEmpty) (label: 'Same color', items: same),
    if (alt.isNotEmpty) (label: 'Alternatives', items: alt),
    if (other.isNotEmpty) (label: 'Other', items: other),
  ];
}

Future<void> showAddItemSheet(BuildContext context, String category) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.white,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (_) => AddItemSheet(category: category),
  );
}

class AddItemSheet extends ConsumerWidget {
  const AddItemSheet({super.key, required this.category});

  final String category;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final itemsAsync = ref.watch(wardrobeItemsProvider);
    final slots = ref.watch(tryOnSlotsProvider);
    final current = slotForCategory(slots, category);
    final allItems = itemsAsync.valueOrNull ?? [];
    final items = allItems
        .whereType<Map>()
        .map(Map<String, dynamic>.from)
        .where(wardrobeItemActive)
        .where((item) => item['category'] == category)
        .toList();
    final itemsById = <String, Map<String, dynamic>>{
      for (final item in items) (item['id'] as String? ?? ''): item,
    };
    final reference = _referenceColors(current, itemsById);
    final buckets = bucketItemsByColor(items, reference);
    final label = wardrobeCategoryLabels[category] ?? category;

    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 20, 20, 0),
        child: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      'Add $label',
                      style: AppTypography.body
                          .copyWith(fontWeight: FontWeight.w700),
                    ),
                  ),
                  InkWell(
                    onTap: () => Navigator.of(context).pop(),
                    customBorder: const CircleBorder(),
                    child: const Padding(
                      padding: EdgeInsets.all(4),
                      child: Icon(Icons.close,
                          color: AppColors.textPrimary, size: 24),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              _GenerateTile(
                key: ValueKey('generate_$category'),
                onTap: () {
                  final aiItem = _pendingAiItem(current, itemsById);
                  ref.read(tryOnSlotsProvider.notifier).setSlot(category, {
                    'kind': 'ai',
                    'category': category,
                    'aiItem': aiItem,
                  });
                  Navigator.of(context).pop();
                },
              ),
              const SizedBox(height: 10),
              _UploadTile(
                key: ValueKey('upload_$category'),
              ),
              const SizedBox(height: 16),
              if (buckets.isEmpty)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 24),
                  child: Center(
                    child: Text('No items yet', style: AppTypography.caption),
                  ),
                )
              else
                for (final bucket in buckets) ...[
                  if (bucket.label != null)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 8),
                      child: Text(
                        bucket.label!,
                        style: AppTypography.slotLabel
                            .copyWith(color: AppColors.textSecondary),
                      ),
                    ),
                  _ItemGrid(
                    items: bucket.items,
                    selectedId: current?['itemId'] as String?,
                    onSelect: (item) {
                      ref.read(tryOnSlotsProvider.notifier).setSlot(category, {
                        'kind': 'wardrobe',
                        'category': category,
                        'itemId': item['id'],
                      });
                      Navigator.of(context).pop();
                    },
                  ),
                  const SizedBox(height: 16),
                ],
              const SizedBox(height: 4),
              Row(
                children: [
                  TextButton(
                    key: const ValueKey('tryon_reset_slot'),
                    onPressed: () =>
                        _confirmReset(context, ref, category),
                    child: Text(
                      'Reset',
                      style: AppTypography.buttonLabel
                          .copyWith(color: AppColors.dontRed),
                    ),
                  ),
                  const Spacer(),
                  ElevatedButton(
                    key: const ValueKey('tryon_done_slot'),
                    onPressed: () => Navigator.of(context).pop(),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppColors.accent,
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(
                          horizontal: 28, vertical: 12),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                    child: const Text('Done', style: AppTypography.buttonLabel),
                  ),
                ],
              ),
              const SizedBox(height: 20),
            ],
          ),
        ),
      ),
    );
  }

  List<Map<String, dynamic>>? _referenceColors(
    Map<String, dynamic>? current,
    Map<String, Map<String, dynamic>> itemsById,
  ) {
    if (current == null) return null;
    if (current['kind'] == 'wardrobe') {
      final item = itemsById[current['itemId']];
      return item == null ? null : _colorsOf(item);
    }
    if (current['kind'] == 'ai') {
      final ai = current['aiItem'];
      if (ai is Map) return _colorsOf(Map<String, dynamic>.from(ai));
    }
    return null;
  }

  Map<String, dynamic> _pendingAiItem(
    Map<String, dynamic>? current,
    Map<String, Map<String, dynamic>> itemsById,
  ) {
    // AI generation is pending until a pipeline exists; for now an AI item
    // reuses the selected wardrobe item's data (owned:false semantics are
    // deferred to the backend).
    if (current?['kind'] == 'wardrobe') {
      final item = itemsById[current!['itemId']];
      if (item != null) {
        return {
          'imageUrl': item['imageUrl'],
          'category': item['category'] ?? category,
          'brand': item['brand'],
          'fit': item['fit'],
          'length': item['length'],
          'colors': item['colors'] ?? <dynamic>[],
        };
      }
    }
    return {
      'imageUrl': '',
      'category': category,
      'brand': null,
      'fit': null,
      'length': null,
      'colors': <dynamic>[],
    };
  }

  Future<void> _confirmReset(
    BuildContext context,
    WidgetRef ref,
    String category,
  ) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Reset slot?'),
        content: const Text('This clears the selected item for this slot.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Reset'),
          ),
        ],
      ),
    );
    if (confirmed == true) {
      ref.read(tryOnSlotsProvider.notifier).clearSlot(category);
      if (context.mounted) Navigator.of(context).pop();
    }
  }
}

class _GenerateTile extends StatelessWidget {
  const _GenerateTile({super.key, required this.onTap});

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: const Color(0xFFF6F2EA),
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
          child: Row(
            children: [
              const Icon(Icons.auto_awesome,
                  color: AppColors.warmAccent, size: 22),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  'Generate with AI',
                  style: AppTypography.body
                      .copyWith(fontWeight: FontWeight.w500),
                ),
              ),
              Text(
                'Generate',
                style:
                    AppTypography.buttonLabel.copyWith(color: AppColors.accent),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Upload entry point. Disabled (no-op, greyed out) until the image can be
/// run through the wardrobe-upload pipeline — a raw local path would
/// otherwise be persisted as a dead imageUrl.
class _UploadTile extends StatelessWidget {
  const _UploadTile({super.key});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.chip,
      borderRadius: BorderRadius.circular(12),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        child: Row(
          children: [
            const Icon(Icons.add_a_photo_outlined,
                color: AppColors.textMuted, size: 22),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                'Upload an image',
                style: AppTypography.body.copyWith(color: AppColors.textMuted),
              ),
            ),
            Text(
              'Coming soon',
              style: AppTypography.caption
                  .copyWith(color: AppColors.textSecondary),
            ),
          ],
        ),
      ),
    );
  }
}

class _ItemGrid extends StatelessWidget {
  const _ItemGrid({
    required this.items,
    required this.selectedId,
    required this.onSelect,
  });

  final List<Map<String, dynamic>> items;
  final String? selectedId;
  final ValueChanged<Map<String, dynamic>> onSelect;

  @override
  Widget build(BuildContext context) {
    return GridView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 3,
        mainAxisSpacing: 10,
        crossAxisSpacing: 10,
        childAspectRatio: 170 / 200,
      ),
      itemCount: items.length,
      itemBuilder: (context, index) => _WardrobeTile(
        item: items[index],
        selected: items[index]['id'] == selectedId,
        onTap: () => onSelect(items[index]),
      ),
    );
  }
}

class _WardrobeTile extends StatelessWidget {
  const _WardrobeTile({
    required this.item,
    required this.selected,
    required this.onTap,
  });

  final Map<String, dynamic> item;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final id = item['id'] as String? ?? '';
    final name = item['name'] as String? ?? '';
    final imageUrl = item['imageUrl'] as String?;
    return GestureDetector(
      key: ValueKey('tryon_item_$id'),
      onTap: onTap,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Container(
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(10),
                border: selected
                    ? Border.all(color: AppColors.accent, width: 2)
                    : Border.all(color: Colors.transparent),
              ),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(10),
                child: imageUrl == null
                    ? const ColoredBox(color: AppColors.page)
                    : Image.network(
                        imageUrl,
                        fit: BoxFit.cover,
                        loadingBuilder: (context, child, progress) =>
                            progress == null
                                ? child
                                : const ColoredBox(color: AppColors.page),
                        errorBuilder: (context, error, stackTrace) =>
                            const ColoredBox(color: AppColors.page),
                      ),
              ),
            ),
          ),
          const SizedBox(height: 4),
          Text(
            name,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style:
                AppTypography.caption.copyWith(color: AppColors.textPrimary),
          ),
        ],
      ),
    );
  }
}