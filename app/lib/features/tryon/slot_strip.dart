import 'package:flutter/material.dart';

class SlotItem {
  const SlotItem({required this.imageUrl, this.brand, this.changed = false, this.aiGenerated = false});

  final String imageUrl;
  final String? brand;

  /// Red dot next to the label: the slot differs from the last render.
  final bool changed;

  /// Diamond instead of the brand caption: not a real wardrobe row the user owns.
  final bool aiGenerated;
}

class SlotEntry {
  const SlotEntry({required this.key, required this.label, required this.item, this.onPress});

  final String key;
  final String label;
  final SlotItem? item;
  final VoidCallback? onPress;
}

const List<BoxShadow> _cardShadow = [BoxShadow(color: Color(0x66000000), offset: Offset(0.5, 1), blurRadius: 1)];

/// Horizontal strip of tilted slot cards. With [onAdd], an Add Item card is
/// pinned at the left and the scrolling cards slide under it.
class SlotStrip extends StatelessWidget {
  const SlotStrip({super.key, required this.slots, this.onAdd, this.addDisabled = false});

  final List<SlotEntry> slots;
  final VoidCallback? onAdd;
  final bool addDisabled;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 132,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          Positioned.fill(
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              clipBehavior: Clip.none,
              padding: EdgeInsets.fromLTRB(20 + (onAdd != null ? 98 : 0), 12, 20, 16),
              itemCount: slots.length,
              separatorBuilder: (_, __) => const SizedBox(width: 8),
              itemBuilder: (context, i) => Center(child: SlotCard(entry: slots[i], index: i)),
            ),
          ),
          if (onAdd != null)
            Positioned(left: 20, top: 12, bottom: 16, child: _AddSlotCard(onPress: addDisabled ? null : onAdd)),
        ],
      ),
    );
  }
}

class SlotCard extends StatelessWidget {
  const SlotCard({super.key, required this.entry, required this.index});

  final SlotEntry entry;

  /// Alternates the tilt so neighbouring cards lean opposite ways.
  final int index;

  @override
  Widget build(BuildContext context) {
    final item = entry.item;
    return GestureDetector(
      key: ValueKey('slot_${entry.key}'),
      onTap: entry.onPress,
      child: Transform.rotate(
        angle: (index.isEven ? -1 : 1) * 3.14159 / 180,
        child: Container(
          width: 88,
          height: 100,
          padding: const EdgeInsets.fromLTRB(8, 8, 8, 4),
          decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(2), boxShadow: _cardShadow),
          child: Stack(
            clipBehavior: Clip.none,
            children: [
              Column(
                children: [
                  Expanded(
                    child: item == null
                        ? const SizedBox()
                        : Image.network(item.imageUrl, width: double.infinity, fit: BoxFit.contain, errorBuilder: (_, __, ___) => const SizedBox()),
                  ),
                  const SizedBox(height: 4),
                  if (item?.aiGenerated ?? false)
                    Image.asset('assets/diamond.png', width: 16, height: 14)
                  else
                    Text(item?.brand ?? '', maxLines: 1, textAlign: TextAlign.center, style: const TextStyle(fontSize: 9, color: Color(0xFF444444))),
                ],
              ),
              // Sticker label peeking past the card's top-left corner.
              Positioned(
                left: -9,
                top: -9,
                child: Transform.rotate(
                  angle: -15 * 3.14159 / 180,
                  alignment: Alignment.topLeft,
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        entry.label.toUpperCase(),
                        style: TextStyle(
                          fontFamily: 'FunnelSans',
                          fontWeight: FontWeight.bold,
                          fontSize: 9,
                          height: 12 / 9,
                          letterSpacing: 0.18,
                          color: const Color(0xFFDC2626).withValues(alpha: 0.68),
                        ),
                      ),
                      if (item?.changed ?? false) ...[
                        const SizedBox(width: 4),
                        Container(width: 8, height: 8, decoration: const BoxDecoration(color: Color(0xFFFF0D00), shape: BoxShape.circle)),
                      ],
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _AddSlotCard extends StatelessWidget {
  const _AddSlotCard({required this.onPress});

  final VoidCallback? onPress;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      key: const ValueKey('slot_add'),
      onTap: onPress,
      child: Opacity(
        opacity: onPress == null ? 0.5 : 1,
        child: Container(
          width: 90,
          height: 100,
          padding: const EdgeInsets.all(8),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(2),
            border: const Border(right: BorderSide(color: Color(0x1A000000))),
            boxShadow: _cardShadow,
          ),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Image.asset('assets/add-item.png', width: 74, height: 65),
              const SizedBox(height: 7),
              const Text(
                '+ Add Item',
                maxLines: 1,
                softWrap: false,
                overflow: TextOverflow.clip,
                style: TextStyle(fontFamily: 'FunnelSans', fontSize: 9, height: 12 / 9, letterSpacing: 0.18, color: Color(0xFF3C3C3C)),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
