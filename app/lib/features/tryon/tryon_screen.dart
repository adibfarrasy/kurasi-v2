import 'dart:async';
import 'dart:ui' show ImageFilter;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api/api_providers.dart';
import '../../core/api/endpoints.dart';
import '../../core/api/wardrobe_items_provider.dart';
import '../../core/design/tab_bar.dart';
import '../myfit/outfits_provider.dart';
import '../myfit/profile_sheet.dart';
import '../wardrobe/wardrobe_ui_provider.dart';
import 'add_item_sheet.dart';
import 'hero_floor.dart';
import 'save_fit_sheet.dart';
import 'slot_strip.dart';
import 'steal_the_look_draft.dart';
import 'tone_background.dart';

const Map<String, String> _slotLabels = {
  'headwear': 'HEADWEAR',
  'shirt': 'SHIRT',
  'jacket': 'JACKET',
  'pants': 'PANTS',
  'footwear': 'SHOES',
};

const TextStyle _funnel = TextStyle(fontFamily: 'FunnelSans', color: Colors.black);

class TryOnScreen extends ConsumerStatefulWidget {
  const TryOnScreen({super.key});

  @override
  ConsumerState<TryOnScreen> createState() => _TryOnScreenState();
}

class _TryOnScreenState extends ConsumerState<TryOnScreen> {
  /// Category to wardrobe item id, or [aiKey] to keep the draft's AI item.
  Map<String, String> _selections = {};

  /// Selections as of the last successful render; diverging from it flips
  /// the CTA from "Save" to "Regenerate".
  Map<String, String> _committed = {};
  String? _regenSessionId;
  String? _regenHeroUrl;
  Timer? _poll;

  bool get _regenerating => _regenSessionId != null;

  @override
  void initState() {
    super.initState();
    Future.microtask(() => hydrateStealTheLookDraft(ref));
  }

  @override
  void dispose() {
    _poll?.cancel();
    super.dispose();
  }

  Map<String, dynamic>? _aiItem(Map<String, dynamic>? draft, String category) {
    final items = draft?['items'];
    if (items is! List) return null;
    for (final it in items) {
      if (it is Map && it['category'] == category) return Map<String, dynamic>.from(it);
    }
    return null;
  }

  Future<void> _openSheet(String category, Map<String, dynamic>? draft) async {
    final ai = <String, Map<String, dynamic>>{
      for (final c in wardrobeCategories)
        if (_aiItem(draft, c) case final it?) c: it,
    };
    final picked = await showAddItemSheet(context, initial: _selections, aiItems: ai, initialCategory: category);
    if (picked != null && mounted) setState(() => _selections = Map.of(picked));
  }

  /// Resolves what each slot currently shows: a wardrobe pick wins over the
  /// draft's AI item for that category.
  ({Map<String, dynamic>? wardrobe, Map<String, dynamic>? ai}) _resolve(
    String category,
    Map<String, dynamic>? draft,
    Map<String, Map<String, dynamic>> itemsById,
  ) {
    final sel = _selections[category];
    final wardrobe = sel != null && sel != aiKey ? itemsById[sel] : null;
    return (wardrobe: wardrobe, ai: wardrobe == null ? _aiItem(draft, category) : null);
  }

  Future<void> _regenerate(List<Map<String, dynamic>> items) async {
    if (items.isEmpty) return;
    try {
      // The backend ignores the outfit id; try-on renders aren't tied to an outfit yet.
      final res = await ref.read(apiClientProvider).post(ApiEndpoints.outfitRegenerate('tryon'), body: {'items': items});
      final id = res is Map ? res['sessionId'] as String? : null;
      if (id == null || !mounted) return;
      final snapshot = Map.of(_selections);
      setState(() => _regenSessionId = id);
      _poll = Timer.periodic(const Duration(seconds: 2), (timer) async {
        try {
          final p = await ref.read(apiClientProvider).get(ApiEndpoints.outfitRegenerateProgress(id));
          if (!mounted || p is! Map) return;
          if (p['phase'] == 'done') {
            timer.cancel();
            setState(() {
              _regenHeroUrl = p['resultUrl'] as String?;
              _committed = snapshot;
              _regenSessionId = null;
            });
          } else if (p['phase'] == 'error') {
            timer.cancel();
            debugPrint('[regenerate] error: ${p['message']}');
            setState(() => _regenSessionId = null);
          }
        } catch (err) {
          debugPrint('[regenerate] poll failed: $err');
        }
      });
    } catch (err) {
      debugPrint('[regenerate] start failed: $err');
    }
  }

  Future<void> _save(List<Map<String, dynamic>> slotsPayload, Map<String, dynamic>? draft) async {
    if (slotsPayload.isEmpty) return;
    final name = await showSaveFitSheet(context);
    if (name == null || !mounted) return;
    try {
      await ref.read(apiClientProvider).post(ApiEndpoints.outfitsFromTryon, body: {
        'name': name.isEmpty ? null : name,
        'heroImageUrl': _regenHeroUrl ?? draft?['heroImageUrl'],
        'slots': slotsPayload,
      });
    } catch (err) {
      debugPrint('[saveFromTryOn] failed: $err');
      return;
    }
    ref.invalidate(outfitsProvider);
    // AI items get promoted to clothing_item rows on save.
    ref.invalidate(wardrobeItemsProvider);
    if (draft != null) await persistStealTheLookDraft(ref, null);
    if (mounted) {
      setState(() {
        _selections = {};
        _committed = {};
        _regenHeroUrl = null;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final draft = ref.watch(stealTheLookDraftProvider);
    final wardrobe = ref.watch(wardrobeItemsProvider).valueOrNull ?? const [];
    final itemsById = <String, Map<String, dynamic>>{
      for (final it in wardrobe.whereType<Map>()) it['id'] as String? ?? '': Map<String, dynamic>.from(it),
    };
    final outfits = (ref.watch(outfitsProvider).valueOrNull ?? const []).whereType<Map>();
    final biometrics = ref.watch(biometricsProvider);
    final defaultAvatar = biometrics.valueOrNull?['defaultAvatarUrl'] as String?;

    final slots = <SlotEntry>[];
    final regenItems = <Map<String, dynamic>>[];
    final savePayload = <Map<String, dynamic>>[];
    final colorNames = <String>[];
    final currentIds = <String, String?>{for (final c in wardrobeCategories) slotKeyForCategory(c): null};
    var anyResolved = false;
    var unresolvedAi = false;

    for (final c in wardrobeCategories) {
      final r = _resolve(c, draft, itemsById);
      final display = r.wardrobe ?? r.ai;
      if (r.wardrobe != null) {
        currentIds[slotKeyForCategory(c)] = r.wardrobe!['id'] as String?;
        anyResolved = true;
      } else if (r.ai != null) {
        // A draft AI item isn't a clothing_item yet, so no saved outfit can match.
        unresolvedAi = true;
      }
      if (display == null) continue;
      final firstColor = (display['colors'] as List?)?.whereType<Map>().firstOrNull?['name'];
      if (firstColor is String) colorNames.add(firstColor);
      slots.add(SlotEntry(
        key: c,
        label: _slotLabels[c]!,
        item: SlotItem(
          imageUrl: display['imageUrl'] as String? ?? '',
          brand: display['brand'] as String?,
          changed: _selections[c] != _committed[c],
          aiGenerated: r.ai != null || r.wardrobe?['owned'] == false,
        ),
        onPress: _regenerating ? null : () => _openSheet(c, draft),
      ));
      regenItems.add({'category': c, 'imageUrl': display['imageUrl'], 'fit': display['fit'], 'length': display['length']});
      savePayload.add(r.wardrobe != null
          ? {'category': c, 'wardrobeId': r.wardrobe!['id']}
          : {
              'category': c,
              'aiItem': {
                'imageUrl': r.ai!['imageUrl'],
                'category': r.ai!['category'],
                'brand': r.ai!['brand'],
                'fit': r.ai!['fit'],
                'length': r.ai!['length'],
                'colors': r.ai!['colors'] ?? const [],
              },
            });
    }

    Map<String, dynamic>? matched;
    if (anyResolved && !unresolvedAi) {
      for (final o in outfits) {
        if (currentIds.entries.every((e) => o[e.key] == e.value)) {
          matched = Map<String, dynamic>.from(o);
          break;
        }
      }
    }

    final heroUrl = matched?['heroImageUrl'] as String? ?? _regenHeroUrl ?? draft?['heroImageUrl'] as String? ?? defaultAvatar;
    // Tone tracks real renders only, not transient picks.
    final tone = matched != null || _regenHeroUrl != null ? outfitTone(colorNames) : 'neutral';
    final hasChanges = slots.any((s) => s.item!.changed);
    final top = MediaQuery.paddingOf(context).top;
    final iconColor = tone == 'neutral' ? Colors.black : Colors.white;

    Widget cta;
    if (slots.isEmpty) {
      cta = const SizedBox.shrink();
    } else if (_regenerating) {
      cta = SizedBox(
        height: 40,
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Image.asset('assets/sparkle.png', width: 18, height: 18, color: Colors.black),
            const SizedBox(width: 10),
            Text('Building your style...', style: _funnel.copyWith(fontSize: 16, height: 22 / 16, letterSpacing: -0.16)),
          ],
        ),
      );
    } else if (matched != null) {
      cta = SizedBox(
        height: 40,
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Image.asset('assets/check.png', width: 16, height: 16, color: toneAccent(tone)),
            const SizedBox(width: 8),
            Text.rich(TextSpan(style: _funnel.copyWith(fontSize: 14, height: 18 / 14), children: [
              TextSpan(text: 'My Fit • ', style: TextStyle(color: toneAccent(tone))),
              TextSpan(text: matched['name'] as String? ?? 'Untitled'),
            ])),
          ],
        ),
      );
    } else {
      cta = GestureDetector(
        key: const ValueKey('tryon_cta'),
        onTap: () => hasChanges ? _regenerate(regenItems) : _save(savePayload, draft),
        child: Container(
          height: 40,
          padding: const EdgeInsets.symmetric(horizontal: 4),
          decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(99)),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Image.asset(hasChanges ? 'assets/sparkle.png' : 'assets/bookmark-simple.png', width: 18, height: 18, color: Colors.black),
              const SizedBox(width: 10),
              Text(hasChanges ? 'Regenerate my fit' : 'Save to My Fit', style: _funnel.copyWith(fontSize: 14, height: 18 / 14)),
            ],
          ),
        ),
      );
    }

    return Scaffold(
      body: ToneBackground(
        tone: tone,
        child: Stack(
          children: [
            Padding(
              padding: EdgeInsets.only(bottom: tabBarHeight(context)),
              child: Column(
                children: [
                  Expanded(
                    child: Stack(
                      clipBehavior: Clip.none,
                      children: [
                        Positioned.fill(child: HeroFloor(imageUrl: heroUrl, topOffset: top + 8, maxHeight: 520, loading: biometrics.isLoading)),
                        if (_regenerating) ...[
                          Positioned(
                            left: 0,
                            right: 0,
                            top: 0,
                            height: top + 8 + 520,
                            child: ClipRect(
                              child: BackdropFilter(filter: ImageFilter.blur(sigmaX: 12, sigmaY: 12), child: const SizedBox.expand()),
                            ),
                          ),
                          Positioned(
                            left: 40,
                            right: 40,
                            top: top + 8 + 260,
                            child: Text(
                              'While AI is generating the image, you can safely browse another page.',
                              textAlign: TextAlign.center,
                              style: _funnel.copyWith(
                                fontSize: 12,
                                height: 16 / 12,
                                letterSpacing: 0.06,
                                color: const Color(0xFF666666),
                                shadows: const [Shadow(color: Colors.white, blurRadius: 10)],
                              ),
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                  SlotStrip(
                    slots: slots,
                    // The draft flow already covers per-slot edits.
                    onAdd: draft == null ? () => _openSheet('headwear', draft) : null,
                    addDisabled: _regenerating,
                  ),
                  Padding(padding: const EdgeInsets.fromLTRB(20, 0, 20, 11), child: cta),
                ],
              ),
            ),
            Positioned(
              left: 20,
              right: 20,
              top: top,
              height: 48,
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const SizedBox(width: 24),
                  tone == 'neutral'
                      ? Image.asset('assets/logomark-dark.png', width: 104, height: 40)
                      : Image.asset('assets/logomark.png', width: 104, height: 40, color: Colors.white),
                  GestureDetector(
                    key: const ValueKey('tryon_menu'),
                    onTap: () => ProfileSheet.show(context),
                    child: Image.asset('assets/list.png', width: 24, height: 24, color: iconColor),
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
