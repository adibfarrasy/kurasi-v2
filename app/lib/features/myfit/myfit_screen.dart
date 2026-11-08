import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show rootBundle;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:go_router/go_router.dart';
import '../../core/api/wardrobe_items_provider.dart';
import '../../core/design/tab_bar.dart';
import 'outfits_provider.dart';
import 'profile_sheet.dart';

const List<String> _slotKeys = ['headwearId', 'baseId', 'outerId', 'bottomId', 'footwearId'];

/// Outfit slots holding items the user doesn't own yet (saved from AI suggestions).
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

/// Cover falls back to the first filled slot's thumbnail for outfits saved
/// without ever running the dress-avatar pipeline.
String? _coverUrl(Map<String, dynamic> outfit, Map<String, Map<String, dynamic>> itemsById) {
  final hero = outfit['heroImageUrl'];
  if (hero is String) return hero;
  for (final key in ['outerId', 'baseId', 'bottomId', 'headwearId', 'footwearId']) {
    final url = itemsById[outfit[key]]?['imageUrl'];
    if (url is String) return url;
  }
  return null;
}

const TextStyle _bebas = TextStyle(fontFamily: 'BebasNeue', fontSize: 48, height: 52 / 48, color: Colors.black);
const TextStyle _kirang = TextStyle(fontFamily: 'KirangHaerang', fontSize: 58, height: 52 / 58, color: Colors.black);

class MyFitScreen extends ConsumerWidget {
  const MyFitScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final outfits = ref.watch(outfitsProvider);
    final wardrobe = ref.watch(wardrobeItemsProvider);
    final itemsById = <String, Map<String, dynamic>>{
      for (final item in (wardrobe.valueOrNull ?? []))
        if (item is Map) (item['id'] as String? ?? ''): Map<String, dynamic>.from(item),
    };
    final outfitList = (outfits.valueOrNull ?? []).whereType<Map>().map(Map<String, dynamic>.from).toList();
    final error = outfits.error ?? wardrobe.error;

    Future<void> refresh() => Future.wait([
          ref.refresh(outfitsProvider.future),
          ref.refresh(wardrobeItemsProvider.future),
        ]);

    Widget body;
    if (outfits.isLoading || wardrobe.isLoading) {
      body = const Center(child: CircularProgressIndicator());
    } else if (error != null || outfitList.isEmpty) {
      body = RefreshIndicator(
        onRefresh: refresh,
        child: LayoutBuilder(
          builder: (context, c) => SingleChildScrollView(
            physics: const AlwaysScrollableScrollPhysics(),
            child: SizedBox(
              height: c.maxHeight,
              child: Center(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 32),
                  child: error != null
                      ? Text('$error', textAlign: TextAlign.center, style: const TextStyle(color: Colors.red))
                      : const Text('No saved outfits yet', style: TextStyle(color: Color(0xFF6B7280))),
                ),
              ),
            ),
          ),
        ),
      );
    } else {
      body = RefreshIndicator(
        onRefresh: refresh,
        child: SingleChildScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(12, 0, 12, 100),
          child: Center(
            child: Wrap(
              children: [
                for (var i = 0; i < outfitList.length; i++)
                  _OutfitCard(
                    outfit: outfitList[i],
                    index: i,
                    coverUrl: _coverUrl(outfitList[i], itemsById),
                    aiCount: unownedSlotCount(outfitList[i], itemsById),
                  ),
                // Keeps an odd last card left-aligned instead of centered.
                if (outfitList.length.isOdd) const SizedBox(width: 182, height: 233),
              ],
            ),
          ),
        ),
      );
    }

    final top = MediaQuery.paddingOf(context).top;
    return Scaffold(
      backgroundColor: const Color(0xFFEBEBEB),
      body: Stack(
        children: [
          Padding(
            padding: EdgeInsets.only(top: 64, bottom: tabBarHeight(context)),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Padding(
                  padding: EdgeInsets.fromLTRB(24, 0, 24, 16),
                  child: Text.rich(TextSpan(style: _bebas, children: [
                    TextSpan(text: 'S'),
                    TextSpan(text: 'A', style: _kirang),
                    TextSpan(text: 'VED OU'),
                    TextSpan(text: 'T', style: _kirang),
                    TextSpan(text: 'FITS'),
                  ])),
                ),
                Expanded(child: body),
              ],
            ),
          ),
          Positioned(
            top: top + 12,
            right: 20,
            child: GestureDetector(
              key: const ValueKey('myfit_menu'),
              behavior: HitTestBehavior.opaque,
              onTap: () => ProfileSheet.show(context),
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Image.asset('assets/list.png', width: 24, height: 24, color: Colors.black),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _OutfitCard extends StatelessWidget {
  const _OutfitCard({required this.outfit, required this.index, required this.coverUrl, required this.aiCount});

  final Map<String, dynamic> outfit;
  final int index;
  final String? coverUrl;
  final int aiCount;

  static const _meta = TextStyle(fontFamily: 'FunnelSans', fontSize: 12, height: 16 / 12, letterSpacing: 0.06);

  @override
  Widget build(BuildContext context) {
    final id = outfit['id'] as String? ?? '';
    final created = DateTime.tryParse(outfit['createdAt'] as String? ?? '')?.toLocal();
    String two(int v) => v.toString().padLeft(2, '0');
    final date = created == null ? '' : '${two(created.month)}/${two(created.day)}/${created.year}';

    return GestureDetector(
      key: ValueKey('outfit_card_$id'),
      behavior: HitTestBehavior.opaque,
      onTap: () => context.push('/outfit/$id?n=${index + 1}'),
      child: Container(
        width: 170,
        height: 221,
        margin: const EdgeInsets.all(6),
        padding: const EdgeInsets.all(11),
        child: Stack(
          clipBehavior: Clip.none,
          children: [
            Column(
              children: [
                Expanded(
                  child: Stack(
                    clipBehavior: Clip.none,
                    fit: StackFit.expand,
                    children: [
                      if (coverUrl != null)
                        Image.network(coverUrl!, fit: BoxFit.contain, errorBuilder: (_, __, ___) => const SizedBox()),
                      if (aiCount > 0) Positioned(right: -10, top: -20, child: _AiItemsBadge(count: aiCount)),
                    ],
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  outfit['name'] as String? ?? 'Untitled',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  textAlign: TextAlign.center,
                  style: _meta.copyWith(fontWeight: FontWeight.bold, color: Colors.black),
                ),
                const SizedBox(height: 2),
                Text(date, maxLines: 1, textAlign: TextAlign.center, style: _meta.copyWith(color: const Color(0xFF848484))),
              ],
            ),
            if (aiCount > 0)
              Positioned(top: 2 - 11, right: 5 - 11, child: Image.asset('assets/diamond.png', width: 28, height: 28)),
          ],
        ),
      ),
    );
  }
}

/// Curved "N items AI-generated" label from Figma; the digit is substituted
/// into the SVG so it follows the same rotation as the outlined text.
class _AiItemsBadge extends StatelessWidget {
  const _AiItemsBadge({required this.count});

  final int count;

  static final Future<String> _template = rootBundle.loadString('assets/ai-items-badge.svg.tmpl');

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<String>(
      future: _template,
      builder: (context, snap) => SizedBox(
        width: 60,
        height: 72,
        child: snap.hasData ? SvgPicture.string(snap.data!.replaceAll('{{count}}', '$count')) : null,
      ),
    );
  }
}
