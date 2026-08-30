import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_typography.dart';
import 'outfits_provider.dart';
import 'profile_sheet.dart';

const List<String> _slotKeys = ['headwearId', 'baseId', 'outerId', 'bottomId', 'footwearId'];

int unownedSlotCount(Map<String, dynamic> outfit, Map<String, Map<String, dynamic>> itemsById) {
  var count = 0;
  for (final key in _slotKeys) {
    final id = outfit[key];
    if (id is! String) continue;
    final item = itemsById[id];
    if (item == null) continue;
    if (item['owned'] == false) count++;
  }
  return count;
}

class MyFitScreen extends ConsumerWidget {
  const MyFitScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final outfits = ref.watch(outfitsProvider);
    final wardrobe = ref.watch(wardrobeItemsProvider);
    final itemsById = <String, Map<String, dynamic>>{
      for (final item in (wardrobe.valueOrNull ?? []))
        if (item is Map)
          (item['id'] as String? ?? ''): Map<String, dynamic>.from(item),
    };

    final outfitList = (outfits.valueOrNull ?? [])
        .whereType<Map>()
        .map(Map<String, dynamic>.from)
        .toList();

    return Scaffold(
      backgroundColor: AppColors.myFitPage,
      body: Stack(
        children: [
          Positioned.fill(
            child: _buildBody(context, ref, outfitList, itemsById),
          ),
          SafeArea(
            child: Align(
              alignment: Alignment.topLeft,
              child: Padding(
                padding: const EdgeInsets.all(8),
                child: IconButton(
                  key: const ValueKey('myfit_menu'),
                  onPressed: () => ProfileSheet.show(context),
                  icon: const Icon(Icons.menu_rounded, color: AppColors.textPrimary, size: 28),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildBody(
    BuildContext context,
    WidgetRef ref,
    List<Map<String, dynamic>> outfitList,
    Map<String, Map<String, dynamic>> itemsById,
  ) {
    final outfits = ref.watch(outfitsProvider);
    return outfits.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) =>
          const Center(child: Text('Failed to load outfits', style: AppTypography.body)),
      data: (_) => RefreshIndicator(
        onRefresh: () => Future.wait([
          ref.refresh(outfitsProvider.future),
          ref.refresh(wardrobeItemsProvider.future),
        ]),
        child: GridView.builder(
          padding: const EdgeInsets.fromLTRB(16, 72, 16, 96),
          physics: const AlwaysScrollableScrollPhysics(),
          gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: 2,
            mainAxisSpacing: 12,
            crossAxisSpacing: 12,
            childAspectRatio: 170 / 221,
          ),
          itemCount: outfitList.length,
          itemBuilder: (context, index) => _OutfitCard(
            outfit: outfitList[index],
            aiCount: unownedSlotCount(outfitList[index], itemsById),
          ),
        ),
      ),
    );
  }
}

class _OutfitCard extends StatelessWidget {
  const _OutfitCard({required this.outfit, required this.aiCount});

  final Map<String, dynamic> outfit;
  final int aiCount;

  @override
  Widget build(BuildContext context) {
    final id = outfit['id'] as String? ?? '';
    final name = outfit['name'] as String? ?? '';
    final hero = outfit['heroImageUrl'] as String?;

    return InkWell(
      key: ValueKey('outfit_card_$id'),
      onTap: () => context.push('/outfit/$id'),
      borderRadius: BorderRadius.circular(12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: ClipRRect(
              borderRadius: BorderRadius.circular(12),
              child: Stack(
                fit: StackFit.expand,
                children: [
                  _HeroImage(url: hero),
                  if (aiCount > 0)
                    Positioned(
                      top: 8,
                      right: 8,
                      child: _AiBadge(count: aiCount),
                    ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 8),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 2),
            child: Text(
              name,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: AppTypography.body.copyWith(color: AppColors.textPrimary),
            ),
          ),
        ],
      ),
    );
  }
}

class _HeroImage extends StatelessWidget {
  const _HeroImage({required this.url});

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

class _AiBadge extends StatelessWidget {
  const _AiBadge({required this.count});

  final int count;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: AppColors.dark,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.auto_awesome, size: 12, color: AppColors.textOnDark),
          const SizedBox(width: 4),
          Text(
            '$count',
            style: const TextStyle(
              fontFamily: 'FunnelSans',
              fontSize: 12,
              fontWeight: FontWeight.w500,
              color: Colors.white,
            ),
          ),
        ],
      ),
    );
  }
}