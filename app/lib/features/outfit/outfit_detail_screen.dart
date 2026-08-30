import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/api/api_providers.dart';
import '../../core/api/endpoints.dart';
import '../../core/api/wardrobe_items_provider.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_typography.dart';
import '../myfit/outfits_provider.dart';
import '../tryon/hero_floor.dart';
import '../tryon/slot_strip.dart';
import '../tryon/tone_background.dart';
import '../wardrobe/wardrobe_ui_provider.dart';

const List<String> _ratingValues = ['loved', 'ok', 'didnt_work'];

const Map<String, String> _ratingLabels = {
  'loved': 'Loved',
  'ok': 'OK',
  'didnt_work': "Didn't Work",
};

/// Finds an outfit by id in the outfits list (read straight from
/// [outfitsProvider], matching the endpoint the detail screen renders).
Map<String, dynamic>? outfitById(List<dynamic> outfits, String id) {
  for (final raw in outfits) {
    if (raw is Map && raw['id'] == id) {
      return Map<String, dynamic>.from(raw);
    }
  }
  return null;
}

/// Maps a saved outfit's slot columns to try-on slot selection maps so the
/// detail screen can reuse [SlotStrip] in read-only mode.
Map<String, dynamic> slotsFromOutfit(Map<String, dynamic> outfit) {
  final result = <String, dynamic>{};
  for (final category in wardrobeCategories) {
    final id = outfit[slotKeyForCategory(category)];
    if (id is String) {
      result[category] = {
        'kind': 'wardrobe',
        'category': category,
        'itemId': id,
      };
    }
  }
  return result;
}

/// Ordered hero carousel sources: the outfit hero first, then every filled
/// slot item's image.
List<String> heroCarouselUrls(
  Map<String, dynamic> outfit,
  Map<String, Map<String, dynamic>> itemsById,
) {
  final urls = <String>[];
  final hero = outfit['heroImageUrl'];
  if (hero is String) urls.add(hero);
  for (final category in wardrobeCategories) {
    final id = outfit[slotKeyForCategory(category)];
    if (id is String) {
      final url = itemsById[id]?['imageUrl'];
      if (url is String) urls.add(url);
    }
  }
  return urls;
}

class OutfitDetailScreen extends ConsumerStatefulWidget {
  const OutfitDetailScreen({super.key, required this.id});

  final String id;

  @override
  ConsumerState<OutfitDetailScreen> createState() => _OutfitDetailScreenState();
}

class _OutfitDetailScreenState extends ConsumerState<OutfitDetailScreen> {
  final _controller = PageController();
  int _page = 0;
  String? _rating;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  List<String> _slotColorNames(
    Map<String, dynamic> outfit,
    Map<String, Map<String, dynamic>> itemsById,
  ) {
    final names = <String>[];
    for (final category in wardrobeCategories) {
      final id = outfit[slotKeyForCategory(category)];
      if (id is! String) continue;
      final colors = itemsById[id]?['colors'];
      if (colors is List) {
        for (final color in colors) {
          if (color is Map && color['name'] is String) {
            names.add(color['name'] as String);
          }
        }
      }
    }
    return names;
  }

  Future<void> _rate(String rating) async {
    setState(() => _rating = rating);
    try {
      await ref.read(apiClientProvider).post(
            ApiEndpoints.outfitRate(widget.id),
            body: {'rating': rating},
          );
      ref.invalidate(outfitsProvider);
    } catch (_) {
      if (mounted) setState(() => _rating = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final outfits = ref.watch(outfitsProvider);
    final wardrobe = ref.watch(wardrobeItemsProvider);
    final itemsById = <String, Map<String, dynamic>>{
      for (final item in (wardrobe.valueOrNull ?? []))
        if (item is Map)
          (item['id'] as String? ?? ''): Map<String, dynamic>.from(item),
    };
    final rating = _rating;

    return Scaffold(
      backgroundColor: Colors.transparent,
      body: outfits.when(
        loading: () => const Scaffold(
            backgroundColor: AppColors.page,
            body: Center(child: CircularProgressIndicator())),
        error: (e, _) => const Scaffold(
            backgroundColor: AppColors.page,
            body: Center(child: Text('Failed to load outfit'))),
        data: (_) {
          final outfit =
              outfitById(outfits.valueOrNull ?? [], widget.id);
          if (outfit == null) {
            return const Scaffold(
              backgroundColor: AppColors.page,
              body: Center(child: Text('Outfit not found')),
            );
          }
          final tone = outfitTone(_slotColorNames(outfit, itemsById));
          final urls = heroCarouselUrls(outfit, itemsById);
          return ToneBackground(
            tone: tone,
            child: SafeArea(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  _Header(
                    name: outfit['name'] as String? ?? 'Outfit',
                    index: _page + 1,
                    onClose: () => context.pop(),
                  ),
                  Expanded(
                    child: _HeroCarousel(
                      key: const ValueKey('outfit_hero_carousel'),
                      controller: _controller,
                      urls: urls,
                      onPageChanged: (page) =>
                          setState(() => _page = page),
                    ),
                  ),
                  SlotStrip(
                      slots: slotsFromOutfit(outfit), readOnly: true),
                  _Actions(
                    onShare: () => context.push('/outfit/${widget.id}/edit'),
                    onEdit: () => context.push('/outfit/${widget.id}/edit'),
                  ),
                  _RateRow(
                    rating: rating,
                    onRate: _rate,
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({
    required this.name,
    required this.index,
    required this.onClose,
  });

  final String name;
  final int index;
  final VoidCallback onClose;

  @override
  Widget build(BuildContext context) {
    final padded = index.toString().padLeft(2, '0');
    return SizedBox(
      height: 148,
      child: Stack(
        children: [
          Positioned(
            left: 24,
            top: -8,
            child: Text(
              padded,
              style: AppTypography.display(64)
                  .copyWith(color: Colors.white.withValues(alpha: 0.2)),
            ),
          ),
          Positioned(
            left: 24,
            top: 68,
            child: Text(
              name,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                fontFamily: 'FunnelSans',
                fontSize: 24,
                height: 24 / 24,
                fontWeight: FontWeight.w700,
                letterSpacing: -0.36,
                color: Colors.white,
              ),
            ),
          ),
          Positioned(
            right: 16,
            top: 0,
            child: IconButton(
              key: const ValueKey('outfit_detail_close'),
              onPressed: onClose,
              icon: const Icon(Icons.close_rounded,
                  color: Colors.white, size: 26),
            ),
          ),
        ],
      ),
    );
  }
}

/// Swipeable hero carousel over the hero + slot item images, with a slight
/// parallax translate driven by the scroll offset so adjacent pages peek in
/// from the sides.
class _HeroCarousel extends StatelessWidget {
  const _HeroCarousel({
    super.key,
    required this.controller,
    required this.urls,
    required this.onPageChanged,
  });

  final PageController controller;
  final List<String> urls;
  final ValueChanged<int> onPageChanged;

  @override
  Widget build(BuildContext context) {
    final pageWidth = MediaQuery.sizeOf(context).width - 190;
    return PageView.builder(
      controller: controller,
      itemCount: urls.length,
      onPageChanged: onPageChanged,
      itemBuilder: (context, index) => _HeroPage(
        controller: controller,
        index: index,
        pageWidth: pageWidth,
        url: urls[index],
      ),
    );
  }
}

class _HeroPage extends StatelessWidget {
  const _HeroPage({
    required this.controller,
    required this.index,
    required this.pageWidth,
    required this.url,
  });

  final PageController controller;
  final int index;
  final double pageWidth;
  final String url;

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: controller,
      builder: (context, _) {
        final page = controller.hasClients
            ? controller.page ?? controller.initialPage.toDouble()
            : controller.initialPage.toDouble();
        final dx = (page - index) * pageWidth * 0.12;
        return Center(
          child: Transform.translate(
            offset: Offset(dx, 0),
            child: Container(
              width: pageWidth,
              height: 440,
              clipBehavior: Clip.antiAlias,
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.22),
                borderRadius: BorderRadius.circular(20),
              ),
              child: Image.network(
                url,
                fit: BoxFit.contain,
                loadingBuilder: (context, child, progress) =>
                    progress == null
                        ? child
                        : const ColoredBox(color: Colors.transparent),
                errorBuilder: (context, error, stackTrace) =>
                    const ColoredBox(color: Colors.transparent),
              ),
            ),
          ),
        );
      },
    );
  }
}

class _Actions extends StatelessWidget {
  const _Actions({required this.onShare, required this.onEdit});

  final VoidCallback onShare;
  final VoidCallback onEdit;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 8),
      child: Row(
        children: [
          Expanded(
            child: _ActionPill(
              key: const ValueKey('outfit_detail_share'),
              label: 'Share',
              onTap: onShare,
              dark: false,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: _ActionPill(
              key: const ValueKey('outfit_detail_edit'),
              label: 'Edit',
              onTap: onEdit,
              dark: true,
            ),
          ),
        ],
      ),
    );
  }
}

class _ActionPill extends StatelessWidget {
  const _ActionPill({
    super.key,
    required this.label,
    required this.onTap,
    required this.dark,
  });

  final String label;
  final VoidCallback onTap;
  final bool dark;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        height: 48,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: dark ? AppColors.dark : Colors.white,
          borderRadius: BorderRadius.circular(99),
        ),
        child: Text(
          label,
          style: AppTypography.buttonLabel.copyWith(
            color: dark ? Colors.white : AppColors.textPrimary,
          ),
        ),
      ),
    );
  }
}

class _RateRow extends StatelessWidget {
  const _RateRow({required this.rating, required this.onRate});

  final String? rating;
  final ValueChanged<String> onRate;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          for (final value in _ratingValues)
            Expanded(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 4),
                child: _RatePill(
                  key: ValueKey('rate_$value'),
                  label: _ratingLabels[value]!,
                  selected: rating == value,
                  onTap: () => onRate(value),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _RatePill extends StatelessWidget {
  const _RatePill({
    super.key,
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        height: 40,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: selected
              ? AppColors.dark
              : Colors.white.withValues(alpha: 0.55),
          borderRadius: BorderRadius.circular(20),
        ),
        child: Text(
          label,
          style: AppTypography.caption.copyWith(
            fontWeight: FontWeight.w700,
            color: selected ? Colors.white : AppColors.textSecondary,
          ),
        ),
      ),
    );
  }
}