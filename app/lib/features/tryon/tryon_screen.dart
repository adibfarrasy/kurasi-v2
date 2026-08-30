import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api/wardrobe_items_provider.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_typography.dart';
import '../myfit/outfits_provider.dart';
import '../wardrobe/wardrobe_ui_provider.dart';
import 'hero_floor.dart';
import 'save_fit_sheet.dart';
import 'slot_strip.dart';
import 'steal_the_look_draft.dart';
import 'tone_background.dart';

List<String> _slotColorNames(
  Map<String, dynamic> slots,
  Map<String, Map<String, dynamic>> itemsById,
) {
  final names = <String>[];
  for (final category in wardrobeCategories) {
    final slot = slotForCategory(slots, category);
    if (slot == null) continue;
    List<dynamic>? colors;
    if (slot['kind'] == 'wardrobe') {
      colors = itemsById[slot['itemId']]?['colors'];
    } else {
      final ai = slot['aiItem'];
      if (ai is Map) colors = ai['colors'];
    }
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

class TryOnScreen extends ConsumerStatefulWidget {
  const TryOnScreen({super.key});

  @override
  ConsumerState<TryOnScreen> createState() => _TryOnScreenState();
}

class _TryOnScreenState extends ConsumerState<TryOnScreen> {
  @override
  void initState() {
    super.initState();
    Future.microtask(() => hydrateStealTheLookDraft(ref));
  }

  @override
  Widget build(BuildContext context) {
    final slots = ref.watch(tryOnSlotsProvider);
    final wardrobe = ref.watch(wardrobeItemsProvider).valueOrNull ?? [];
    final itemsById = <String, Map<String, dynamic>>{
      for (final item in wardrobe)
        if (item is Map)
          (item['id'] as String? ?? ''): Map<String, dynamic>.from(item),
    };
    final outfits = ref.watch(outfitsProvider).valueOrNull ?? [];
    final draft = ref.watch(stealTheLookDraftProvider);
    final biometrics = ref.watch(biometricsProvider).valueOrNull;
    final heroUrl = resolveHeroImageUrl(
      outfits: outfits,
      slots: slots,
      draft: draft,
      biometrics: biometrics,
    );
    final tone = outfitTone(_slotColorNames(slots, itemsById));

    return Scaffold(
      backgroundColor: Colors.transparent,
      body: ToneBackground(
        tone: tone,
        child: SafeArea(
          child: Column(
            children: [
              const _Header(),
              Expanded(
                child: Center(child: HeroFloor(imageUrl: heroUrl)),
              ),
              const SlotStrip(),
              _Actions(
                onSaveFit: () =>
                    SaveFitSheet.show(context, heroImageUrl: heroUrl),
                onReset: () =>
                    ref.read(tryOnSlotsProvider.notifier).reset(),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header();

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 8),
      child: Row(
        children: [
          Text(
            'Try On',
            style: AppTypography.display(32).copyWith(color: AppColors.dark),
          ),
          const Spacer(),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.7),
              borderRadius: BorderRadius.circular(20),
            ),
            child: Text(
              'OUTFIT BUILDER',
              style:
                  AppTypography.slotLabel.copyWith(color: AppColors.textMuted),
            ),
          ),
        ],
      ),
    );
  }
}

class _Actions extends StatelessWidget {
  const _Actions({required this.onSaveFit, required this.onReset});

  final VoidCallback onSaveFit;
  final VoidCallback onReset;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 16),
      child: Row(
        children: [
          IconButton(
            key: const ValueKey('tryon_reset'),
            onPressed: onReset,
            icon: const Icon(Icons.refresh, color: AppColors.textPrimary),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: ElevatedButton(
              key: const ValueKey('tryon_save_fit'),
              onPressed: onSaveFit,
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.dark,
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
              child: const Text('Save Fit', style: AppTypography.buttonLabel),
            ),
          ),
        ],
      ),
    );
  }
}