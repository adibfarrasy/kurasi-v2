import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/api/wardrobe_items_provider.dart';
import '../myfit/outfits_provider.dart';
import '../tryon/hero_floor.dart';
import '../tryon/slot_strip.dart';
import '../tryon/tone_background.dart';

const List<(String, String)> _slots = [
  ('baseId', 'SHIRT'),
  ('outerId', 'JACKET'),
  ('bottomId', 'PANTS'),
  ('footwearId', 'SHOES'),
  ('headwearId', 'HAT'),
];

/// Saved-outfit carousel: the active hero stands on the floor, neighbours
/// shrink and fade; the slot strip and tone follow the active outfit.
class OutfitDetailScreen extends ConsumerStatefulWidget {
  const OutfitDetailScreen({super.key, required this.id});

  final String id;

  @override
  ConsumerState<OutfitDetailScreen> createState() => _OutfitDetailScreenState();
}

class _OutfitDetailScreenState extends ConsumerState<OutfitDetailScreen> {
  PageController? _controller;
  int _active = 0;
  bool _scrolling = false;

  @override
  void dispose() {
    _controller?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final outfitsAsync = ref.watch(outfitsProvider);
    final itemsAsync = ref.watch(wardrobeItemsProvider);
    final outfits = (outfitsAsync.valueOrNull ?? const []).whereType<Map>().map(Map<String, dynamic>.from).toList();
    final itemsById = <String, Map<String, dynamic>>{
      for (final it in (itemsAsync.valueOrNull ?? const []).whereType<Map>()) it['id'] as String? ?? '': Map<String, dynamic>.from(it),
    };
    final loading = outfitsAsync.isLoading || itemsAsync.isLoading;
    final width = MediaQuery.sizeOf(context).width;
    final pageWidth = width - 190;

    if (!loading && _controller == null && outfits.isNotEmpty) {
      _active = outfits.indexWhere((o) => o['id'] == widget.id).clamp(0, outfits.length - 1);
      _controller = PageController(initialPage: _active, viewportFraction: pageWidth / width);
    }

    final active = outfits.isEmpty ? null : outfits[_active.clamp(0, outfits.length - 1)];
    final activeSlots = <(String, Map<String, dynamic>)>[
      if (active != null)
        for (final (key, label) in _slots)
          if (itemsById[active[key]] case final item?) (label, item),
    ];
    final tone = outfitTone([
      for (final (_, item) in activeSlots)
        if ((item['colors'] as List?)?.whereType<Map>().firstOrNull?['name'] case final String name) name,
    ]);
    final top = MediaQuery.paddingOf(context).top;

    return Scaffold(
      body: ToneBackground(
        tone: tone,
        child: Stack(
          children: [
            Padding(
              padding: EdgeInsets.only(top: top + 12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  SizedBox(
                    height: 168,
                    child: Stack(
                      clipBehavior: Clip.none,
                      children: [
                        Positioned(
                          left: 24,
                          top: -10,
                          child: IgnorePointer(
                            child: Text(
                              (_active + 1).toString().padLeft(2, '0'),
                              style: TextStyle(fontFamily: 'BebasNeue', fontSize: 64, height: 70 / 64, color: Colors.white.withValues(alpha: 0.2)),
                            ),
                          ),
                        ),
                        Positioned(
                          left: 24,
                          right: 56,
                          top: 8,
                          child: Text(
                            active?['name'] as String? ?? 'Outfit',
                            style: const TextStyle(fontFamily: 'FunnelSans', fontWeight: FontWeight.bold, fontSize: 24, height: 1, letterSpacing: -0.36, color: Colors.white),
                          ),
                        ),
                      ],
                    ),
                  ),
                  Expanded(
                    child: loading || _controller == null
                        ? const Center(child: CircularProgressIndicator(color: Colors.white))
                        : NotificationListener<ScrollNotification>(
                            onNotification: (n) {
                              if (n is ScrollStartNotification && n.dragDetails != null) setState(() => _scrolling = true);
                              if (n is ScrollEndNotification) setState(() => _scrolling = false);
                              return false;
                            },
                            child: PageView.builder(
                              controller: _controller,
                              clipBehavior: Clip.none,
                              itemCount: outfits.length,
                              onPageChanged: (i) => setState(() => _active = i),
                              itemBuilder: (context, i) => AnimatedBuilder(
                                animation: _controller!,
                                builder: (context, _) {
                                  final page = _controller!.position.haveDimensions ? _controller!.page ?? _active.toDouble() : _active.toDouble();
                                  final t = (page - i).abs().clamp(0.0, 1.0);
                                  return _HeroPage(
                                    url: outfits[i]['heroImageUrl'] as String?,
                                    showFloor: !_scrolling && i == _active,
                                    scale: 1 - 0.22 * t,
                                    dy: -54 * t,
                                    opacity: 1 - 0.5 * t,
                                    screenWidth: width,
                                  );
                                },
                              ),
                            ),
                          ),
                  ),
                  Padding(
                    padding: const EdgeInsets.only(bottom: 50),
                    child: Column(
                      children: [
                        SlotStrip(slots: [
                          for (final (label, item) in activeSlots)
                            SlotEntry(
                              key: label,
                              label: label,
                              item: SlotItem(imageUrl: item['imageUrl'] as String? ?? '', brand: item['brand'] as String?, aiGenerated: item['owned'] == false),
                            ),
                        ]),
                        Padding(
                          padding: const EdgeInsets.fromLTRB(20, 8, 20, 8),
                          child: Row(
                            children: [
                              Expanded(
                                child: _PillButton(
                                  key: const ValueKey('outfit_share'),
                                  icon: 'assets/share.png',
                                  label: 'Share',
                                  dark: false,
                                  onTap: active == null ? null : () => context.push('/outfit/${active['id']}/edit'),
                                ),
                              ),
                              const SizedBox(width: 12),
                              Expanded(
                                child: _PillButton(
                                  key: const ValueKey('outfit_edit'),
                                  icon: 'assets/pencil-line.png',
                                  label: 'Edit',
                                  dark: true,
                                  onTap: () => context.go('/tryon'),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            Positioned(
              top: top + 12,
              right: 24,
              child: GestureDetector(
                key: const ValueKey('outfit_close'),
                onTap: () => context.pop(),
                child: Image.asset('assets/x.png', width: 24, height: 24, color: Colors.white),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _HeroPage extends StatelessWidget {
  const _HeroPage({required this.url, required this.showFloor, required this.scale, required this.dy, required this.opacity, required this.screenWidth});

  final String? url;
  final bool showFloor;
  final double scale;
  final double dy;
  final double opacity;
  final double screenWidth;

  @override
  Widget build(BuildContext context) {
    const fallback = Image(image: AssetImage('assets/default-man.png'), fit: BoxFit.contain);
    return Opacity(
      opacity: opacity,
      child: Transform.translate(
        offset: Offset(0, dy - 120),
        child: Transform.scale(
          scale: scale,
          alignment: Alignment.topCenter,
          child: OverflowBox(
            alignment: Alignment.topCenter,
            maxWidth: screenWidth,
            maxHeight: 520,
            child: SizedBox(
              width: showFloor ? screenWidth : 520 * HeroFloor.aspectRatio,
              height: 520,
              child: showFloor
                  ? HeroFloor(imageUrl: url, topOffset: 0, maxHeight: 520)
                  : url == null
                      ? fallback
                      : Image.network(url!, fit: BoxFit.contain, errorBuilder: (_, __, ___) => fallback),
            ),
          ),
        ),
      ),
    );
  }
}

class _PillButton extends StatelessWidget {
  const _PillButton({super.key, required this.icon, required this.label, required this.dark, required this.onTap});

  final String icon;
  final String label;
  final bool dark;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final fg = dark ? Colors.white : Colors.black;
    return GestureDetector(
      onTap: onTap,
      child: Container(
        height: 48,
        decoration: BoxDecoration(color: dark ? Colors.black : Colors.white, borderRadius: BorderRadius.circular(99)),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Image.asset(icon, width: 18, height: 18, color: fg),
            const SizedBox(width: 8),
            Text(label, style: TextStyle(fontWeight: FontWeight.w600, color: fg)),
          ],
        ),
      ),
    );
  }
}
