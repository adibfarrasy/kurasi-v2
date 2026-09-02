import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api/wardrobe_items_provider.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_typography.dart';
import '../myfit/outfits_provider.dart';
import '../wardrobe/wardrobe_ui_provider.dart';
import 'add_item_sheet.dart';
import 'hero_floor.dart';

/// Live selections for the 5 try-on slots, keyed by category
/// (headwear/shirt/jacket/pants/footwear). Each value is
/// `{kind: 'wardrobe'|'ai', category, itemId?|aiItem?}`.
final tryOnSlotsProvider =
    NotifierProvider<TryOnSlotsNotifier, Map<String, dynamic>>(
        TryOnSlotsNotifier.new);

class TryOnSlotsNotifier extends Notifier<Map<String, dynamic>> {
  @override
  Map<String, dynamic> build() => <String, dynamic>{};

  void setSlot(String category, Map<String, dynamic> slot) {
    final next = Map<String, dynamic>.from(state);
    next[category] = Map<String, dynamic>.from(slot);
    state = next;
  }

  void clearSlot(String category) {
    final next = Map<String, dynamic>.from(state);
    next.remove(category);
    state = next;
  }

  void reset() {
    state = <String, dynamic>{};
  }
}

Map<String, dynamic>? slotForCategory(Map<String, dynamic> slots, String category) {
  final raw = slots[category];
  return raw is Map ? Map<String, dynamic>.from(raw) : null;
}

/// Resolves the image shown on a slot card.
String? slotImageUrl(
  Map<String, dynamic> slot,
  Map<String, Map<String, dynamic>> itemsById,
) {
  final kind = slot['kind'];
  if (kind == 'wardrobe') {
    return itemsById[slot['itemId']]?['imageUrl'] as String?;
  }
  if (kind == 'ai') {
    final ai = slot['aiItem'];
    return ai is Map ? ai['imageUrl'] as String? : null;
  }
  return slot['imageUrl'] as String?;
}

/// True when the slot differs from the matched saved outfit. AI/upload slots
/// are never present in a saved outfit, so they always count as changed.
bool slotChanged(
  String category,
  Map<String, dynamic>? slot,
  Map<String, dynamic>? matchedOutfit,
) {
  if (slot == null || matchedOutfit == null) return false;
  final outfitValue = matchedOutfit[slotKeyForCategory(category)];
  if (slot['kind'] == 'wardrobe') return outfitValue != slot['itemId'];
  return true;
}

/// The strip of 5 tilted slot cards. Empty positions render an add card;
/// tapping any position opens the per-category AddItemSheet.
///
/// Pass an explicit [slots] map to render a saved outfit instead of the live
/// try-on selection; with [readOnly] the strip stops responding to taps,
/// empty positions render a plain card and filled cards show the item name.
class SlotStrip extends ConsumerWidget {
  const SlotStrip({super.key, this.slots, this.readOnly = false});

  final Map<String, dynamic>? slots;
  final bool readOnly;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final Map<String, dynamic> slots =
        this.slots ?? ref.watch(tryOnSlotsProvider);
    final items = ref.watch(wardrobeItemsProvider).valueOrNull ?? [];
    final itemsById = <String, Map<String, dynamic>>{
      for (final item in items)
        if (item is Map)
          (item['id'] as String? ?? ''): Map<String, dynamic>.from(item),
    };
    final matched = readOnly
        ? null
        : matchSavedOutfit(slots, ref.watch(outfitsProvider).valueOrNull ?? []);

    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      padding: const EdgeInsets.symmetric(horizontal: 20),
      child: Row(
        children: [
          for (final category in wardrobeCategories) ...[
            _buildPosition(context, category, slots, itemsById, matched),
            if (category != wardrobeCategories.last) const SizedBox(width: 10),
          ],
        ],
      ),
    );
  }

  Widget _buildPosition(
    BuildContext context,
    String category,
    Map<String, dynamic> slots,
    Map<String, Map<String, dynamic>> itemsById,
    Map<String, dynamic>? matched,
  ) {
    final slot = slotForCategory(slots, category);
    return _SlotPosition(
      category: category,
      slot: slot,
      imageUrl: slot == null ? null : slotImageUrl(slot, itemsById),
      itemName: _itemNameFor(slot, itemsById),
      changed: readOnly ? false : slotChanged(category, slot, matched),
      onTap: readOnly ? null : () => showAddItemSheet(context, category),
      readOnly: readOnly,
      isAi: _isAiFor(slot, itemsById),
    );
  }

  String? _itemNameFor(
    Map<String, dynamic>? slot,
    Map<String, Map<String, dynamic>> itemsById,
  ) {
    if (!readOnly || slot == null) return null;
    return itemsById[slot['itemId']]?['name'] as String?;
  }

  bool _isAiFor(
    Map<String, dynamic>? slot,
    Map<String, Map<String, dynamic>> itemsById,
  ) {
    if (readOnly) {
      return slot != null && itemsById[slot['itemId']]?['owned'] == false;
    }
    return slot?['kind'] == 'ai';
  }
}

double _tiltFor(String category) {
  switch (category) {
    case 'headwear':
      return -0.10;
    case 'shirt':
      return -0.05;
    case 'pants':
      return 0.05;
    case 'footwear':
      return 0.10;
    default:
      return 0;
  }
}

class _SlotPosition extends StatelessWidget {
  const _SlotPosition({
    required this.category,
    required this.slot,
    required this.imageUrl,
    required this.changed,
    required this.onTap,
    this.itemName,
    this.readOnly = false,
    this.isAi = false,
  });

  final String category;
  final Map<String, dynamic>? slot;
  final String? imageUrl;
  final bool changed;
  final VoidCallback? onTap;
  final String? itemName;
  final bool readOnly;
  final bool isAi;

  @override
  Widget build(BuildContext context) {
    final label = wardrobeCategoryLabels[category] ?? category;
    return GestureDetector(
      key: ValueKey('slot_$category'),
      onTap: onTap,
      child: SizedBox(
        width: 76,
        height: 116,
        child: Transform.rotate(
          angle: _tiltFor(category),
          child: Stack(
            clipBehavior: Clip.none,
            children: [
              Positioned.fill(
                child: slot == null
                    ? (readOnly
                        ? _EmptySlotCard(label: label)
                        : _AddSlotCard(
                            key: ValueKey('add_slot_$category'), label: label))
                    : _SlotCard(
                        key: ValueKey('slot_card_$category'),
                        imageUrl: imageUrl,
                        label: itemName,
                      ),
              ),
              if (changed && slot != null)
                Positioned(
                  top: -2,
                  right: -2,
                  child: _ChangedDot(
                      key: ValueKey('changed_dot_$category')),
                ),
              if (isAi && slot != null)
                Positioned(
                  top: -6,
                  left: -6,
                  child: _AiBadge(key: ValueKey('ai_badge_$category')),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _SlotCard extends StatelessWidget {
  const _SlotCard({super.key, required this.imageUrl, this.label});

  final String? imageUrl;
  final String? label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.hairline),
        boxShadow: const [
          BoxShadow(color: Colors.black12, blurRadius: 6, offset: Offset(0, 2)),
        ],
      ),
      child: Stack(
        fit: StackFit.expand,
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(8),
            child: imageUrl == null
                ? const ColoredBox(color: AppColors.chip)
                : Image.network(
                    imageUrl!,
                    fit: BoxFit.cover,
                    loadingBuilder: (context, child, progress) =>
                        progress == null
                            ? child
                            : const ColoredBox(color: AppColors.chip),
                    errorBuilder: (context, error, stackTrace) =>
                        const ColoredBox(color: AppColors.chip),
                  ),
          ),
          if (label != null)
            Positioned(
              left: 0,
              right: 0,
              bottom: 0,
              child: Container(
                padding: const EdgeInsets.symmetric(vertical: 3),
                decoration: const BoxDecoration(
                  color: Color(0xB3000000),
                  borderRadius: BorderRadius.vertical(bottom: Radius.circular(8)),
                ),
                child: Text(
                  label!,
                  textAlign: TextAlign.center,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.slotLabel
                      .copyWith(color: Colors.white, letterSpacing: 0),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/// Read-only placeholder for an outfit slot the user hasn't filled.
class _EmptySlotCard extends StatelessWidget {
  const _EmptySlotCard({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.4),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.hairline),
      ),
      child: Center(
        child: Text(
          label,
          textAlign: TextAlign.center,
          style: AppTypography.slotLabel.copyWith(color: AppColors.textMuted),
        ),
      ),
    );
  }
}

class _AddSlotCard extends StatelessWidget {
  const _AddSlotCard({super.key, required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.7),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.hairline),
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(Icons.add_rounded, color: AppColors.textMuted, size: 28),
          const SizedBox(height: 4),
          Text(
            label,
            textAlign: TextAlign.center,
            style: AppTypography.slotLabel.copyWith(color: AppColors.textMuted),
          ),
        ],
      ),
    );
  }
}

class _ChangedDot extends StatelessWidget {
  const _ChangedDot({super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 12,
      height: 12,
      decoration: const BoxDecoration(
        color: AppColors.dontRed,
        shape: BoxShape.circle,
        boxShadow: [BoxShadow(color: Colors.black26, blurRadius: 3)],
      ),
    );
  }
}

class _AiBadge extends StatelessWidget {
  const _AiBadge({super.key});

  @override
  Widget build(BuildContext context) {
    return Transform.rotate(
      angle: math.pi / 4,
      child: Container(
        width: 22,
        height: 22,
        decoration: BoxDecoration(
          color: AppColors.accent,
          borderRadius: BorderRadius.circular(5),
          boxShadow: const [
            BoxShadow(color: Colors.black26, blurRadius: 3),
          ],
        ),
        child: Center(
          child: Transform.rotate(
            angle: -math.pi / 4,
            child: const Icon(Icons.auto_awesome,
                size: 12, color: Colors.white),
          ),
        ),
      ),
    );
  }
}