import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api/wardrobe_items_provider.dart';
import '../../core/design/tab_bar.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_typography.dart';
import 'filter_sheet.dart';
import 'wardrobe_ui_provider.dart';

bool wardrobeItemActive(Map<String, dynamic> item) =>
    item['owned'] == true && item['status'] == 'active';

bool _queryMatches(Map<String, dynamic> item, String query) {
  if (query.isEmpty) return true;
  final q = query.toLowerCase();
  bool prefix(Object? value) =>
      value is String && value.toLowerCase().startsWith(q);

  if (prefix(item['name']) || prefix(item['brand'])) return true;
  final colors = item['colors'];
  if (colors is List) {
    for (final color in colors) {
      if (color is Map && prefix(color['name'])) return true;
    }
  }
  return false;
}

List<Map<String, dynamic>> filteredWardrobeItems(
  List<dynamic> items,
  String query,
  Set<String> selectedCategories,
) {
  return items
      .whereType<Map>()
      .map(Map<String, dynamic>.from)
      .where(wardrobeItemActive)
      .where((item) =>
          _queryMatches(item, query) &&
          (selectedCategories.isEmpty ||
              selectedCategories.contains(item['category'])))
      .toList();
}

class WardrobeScreen extends ConsumerWidget {
  const WardrobeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final itemsAsync = ref.watch(wardrobeItemsProvider);
    final ui = ref.watch(wardrobeUiProvider);

    return Scaffold(
      backgroundColor: AppColors.myFitPage,
      body: SafeArea(
        child: Column(
          children: [
            _Toolbar(ui: ui),
            Expanded(
              child: itemsAsync.when(
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (e, _) =>
                    const Center(child: Text('Failed to load wardrobe', style: AppTypography.body)),
                data: (items) {
                  final filtered = filteredWardrobeItems(
                    items,
                    ui.query,
                    ui.selectedCategories,
                  );
                  if (filtered.isEmpty) {
                    return const Center(
                      child: Text('No items found', style: AppTypography.body),
                    );
                  }
                  return ui.mode == WardrobeMode.grid
                      ? _GridBody(items: filtered)
                      : _ListBody(items: filtered);
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Toolbar extends ConsumerWidget {
  const _Toolbar({required this.ui});

  final WardrobeUiState ui;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final isGrid = ui.mode == WardrobeMode.grid;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
      child: Row(
        children: [
          IconButton(
            key: const ValueKey('wardrobe_mode_toggle'),
            onPressed: () => ref.read(wardrobeUiProvider.notifier).toggleMode(),
            icon: Icon(
              isGrid ? Icons.checkroom : Icons.grid_view_rounded,
              color: AppColors.textPrimary,
              size: 24,
            ),
          ),
          const SizedBox(width: 4),
          InkWell(
            key: const ValueKey('wardrobe_sort'),
            onTap: () => showFilterSheet(context),
            borderRadius: BorderRadius.circular(20),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                color: AppColors.chip,
                borderRadius: BorderRadius.circular(20),
              ),
              child: const Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.sort, color: AppColors.textPrimary, size: 18),
                  SizedBox(width: 4),
                  Text('Sort', style: AppTypography.caption),
                ],
              ),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Container(
              decoration: BoxDecoration(
                color: AppColors.chip,
                borderRadius: BorderRadius.circular(20),
              ),
              padding: const EdgeInsets.symmetric(horizontal: 12),
              child: Row(
                children: [
                  const Icon(Icons.search, color: AppColors.textMuted, size: 18),
                  const SizedBox(width: 6),
                  Expanded(
                    child: TextField(
                      key: const ValueKey('wardrobe_search'),
                      onChanged: (value) =>
                          ref.read(wardrobeUiProvider.notifier).setQuery(value),
                      decoration: const InputDecoration(
                        hintText: 'Search',
                        hintStyle: TextStyle(color: AppColors.textMuted),
                        border: InputBorder.none,
                        isDense: true,
                      ),
                      style: AppTypography.caption,
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

class _GridBody extends StatelessWidget {
  const _GridBody({required this.items});

  final List<Map<String, dynamic>> items;

  @override
  Widget build(BuildContext context) {
    final byCategory = <String, List<Map<String, dynamic>>>{};
    for (final item in items) {
      final category = item['category'] as String? ?? '';
      byCategory.putIfAbsent(category, () => []).add(item);
    }

    return ListView(
      padding: EdgeInsets.fromLTRB(16, 0, 16, tabBarHeight(context)),
      children: [
        for (final category in wardrobeCategories)
          if (byCategory[category]?.isNotEmpty ?? false) ...[
            Padding(
              padding: const EdgeInsets.only(top: 16, bottom: 8),
              child: Text(
                wardrobeCategoryLabels[category] ?? category,
                style: AppTypography.slotLabel.copyWith(color: AppColors.textSecondary),
              ),
            ),
            GridView.builder(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 3,
                mainAxisSpacing: 10,
                crossAxisSpacing: 10,
                childAspectRatio: 170 / 200,
              ),
              itemCount: byCategory[category]!.length,
              itemBuilder: (context, index) =>
                  _GridItemCard(item: byCategory[category]![index]),
            ),
          ],
      ],
    );
  }
}

class _GridItemCard extends StatelessWidget {
  const _GridItemCard({required this.item});

  final Map<String, dynamic> item;

  @override
  Widget build(BuildContext context) {
    final name = item['name'] as String? ?? '';
    final imageUrl = item['imageUrl'] as String?;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: ClipRRect(
            borderRadius: BorderRadius.circular(10),
            child: _ItemImage(url: imageUrl),
          ),
        ),
        const SizedBox(height: 4),
        Text(
          name,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: AppTypography.caption.copyWith(color: AppColors.textPrimary),
        ),
      ],
    );
  }
}

class _ListBody extends StatelessWidget {
  const _ListBody({required this.items});

  final List<Map<String, dynamic>> items;

  @override
  Widget build(BuildContext context) {
    return PageView.builder(
      scrollDirection: Axis.horizontal,
      itemCount: items.length,
      itemBuilder: (context, index) => _ListItemCard(item: items[index]),
    );
  }
}

class _ListItemCard extends StatelessWidget {
  const _ListItemCard({required this.item});

  final Map<String, dynamic> item;

  @override
  Widget build(BuildContext context) {
    final name = item['name'] as String? ?? '';
    final brand = item['brand'] as String? ?? '';
    final imageUrl = item['imageUrl'] as String?;
    final colors = item['colors'];
    final colorNames = <String>[];
    final colorHexes = <String>[];
    if (colors is List) {
      for (final color in colors) {
        if (color is Map) {
          final n = color['name'] as String?;
          final h = color['hex'] as String?;
          if (n != null) colorNames.add(n);
          if (h != null) colorHexes.add(h);
        }
      }
    }

    return Padding(
      padding: EdgeInsets.fromLTRB(16, 0, 16, tabBarHeight(context)),
      child: Container(
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(16),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: ClipRRect(
                borderRadius: const BorderRadius.vertical(top: Radius.circular(16)),
                child: _ItemImage(url: imageUrl),
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: AppTypography.body.copyWith(color: AppColors.textPrimary),
                  ),
                  if (brand.isNotEmpty) ...[
                    const SizedBox(height: 2),
                    Text(
                      brand,
                      style: AppTypography.caption.copyWith(color: AppColors.textSecondary),
                    ),
                  ],
                  if (colorHexes.isNotEmpty) ...[
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        for (final hex in colorHexes)
                          Container(
                            margin: const EdgeInsets.only(right: 6),
                            width: 16,
                            height: 16,
                            decoration: BoxDecoration(
                              color: _colorFromHex(hex) ?? AppColors.disabled,
                              shape: BoxShape.circle,
                              border: Border.all(color: AppColors.hairline),
                            ),
                          ),
                        if (colorNames.isNotEmpty) ...[
                          const SizedBox(width: 4),
                          Text(
                            colorNames.join(', '),
                            style: AppTypography.caption.copyWith(color: AppColors.textMuted),
                          ),
                        ],
                      ],
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

Color? _colorFromHex(String hex) {
  final cleaned = hex.replaceFirst('#', '');
  if (cleaned.length != 6) return null;
  final value = int.tryParse(cleaned, radix: 16);
  if (value == null) return null;
  return Color(0xFF000000 | value);
}

class _ItemImage extends StatelessWidget {
  const _ItemImage({required this.url});

  final String? url;

  @override
  Widget build(BuildContext context) {
    if (url == null) return const ColoredBox(color: AppColors.page);
    return Image.network(
      url!,
      fit: BoxFit.cover,
      loadingBuilder: (context, child, progress) =>
          progress == null ? child : const ColoredBox(color: AppColors.page),
      errorBuilder: (context, error, stackTrace) => const ColoredBox(color: AppColors.page),
    );
  }
}