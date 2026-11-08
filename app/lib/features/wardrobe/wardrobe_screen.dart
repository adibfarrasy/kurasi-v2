import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api/wardrobe_items_provider.dart';
import '../../core/design/flair_sheet.dart';
import '../../core/design/tab_bar.dart';
import '../myfit/profile_sheet.dart';
import 'wardrobe_ui_provider.dart';

/// Unowned rows (AI items promoted by a saved outfit) exist so Try On can
/// reference them, but they don't belong in the closet view.
bool wardrobeItemActive(Map<String, dynamic> item) => item['owned'] == true && item['status'] == 'active';

bool _queryMatches(Map<String, dynamic> item, String query) {
  final q = query.trim().toLowerCase();
  if (q.isEmpty) return true;
  final colors = item['colors'] is List ? item['colors'] as List : const [];
  final words = [
    item['name'] ?? '',
    item['brand'] ?? '',
    for (final c in colors)
      if (c is Map) c['name'] ?? '',
  ].join(' ').toLowerCase().split(RegExp(r'\s+'));
  return words.any((w) => w.startsWith(q));
}

/// Active items matching [query], grouped by category in display order.
Map<String, List<Map<String, dynamic>>> groupWardrobeItems(List<dynamic> items, String query) {
  final map = <String, List<Map<String, dynamic>>>{};
  for (final raw in items.whereType<Map>()) {
    final item = Map<String, dynamic>.from(raw);
    if (!wardrobeItemActive(item) || !_queryMatches(item, query)) continue;
    (map[item['category'] as String? ?? ''] ??= []).add(item);
  }
  return map;
}

const Map<String, String> _sectionLabels = {
  'headwear': 'HEADWEAR',
  'shirt': 'SHIRT',
  'jacket': 'JACKET',
  'pants': 'PANTS',
  'footwear': 'SHOES',
};

const TextStyle _funnel = TextStyle(fontFamily: 'FunnelSans', color: Colors.black);
const TextStyle _bebas = TextStyle(fontFamily: 'BebasNeue', fontSize: 48, height: 52 / 48, color: Colors.black);
const TextStyle _kirang = TextStyle(fontFamily: 'KirangHaerang', fontSize: 58, height: 52 / 58, color: Colors.black);

enum WardrobeMode { grid, list }

class WardrobeScreen extends ConsumerStatefulWidget {
  const WardrobeScreen({super.key});

  @override
  ConsumerState<WardrobeScreen> createState() => _WardrobeScreenState();
}

class _WardrobeScreenState extends ConsumerState<WardrobeScreen> {
  WardrobeMode _mode = WardrobeMode.grid;
  String _query = '';
  bool _searchOpen = false;
  String _filter = 'all';
  final _searchController = TextEditingController();

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  void _closeSearch() {
    _searchController.clear();
    setState(() {
      _searchOpen = false;
      _query = '';
    });
  }

  void _setMode(WardrobeMode mode, Map<String, List<Map<String, dynamic>>> grouped) {
    if (mode == WardrobeMode.grid) {
      // The search button only exists in list mode; don't orphan an open input.
      if (_searchOpen) _closeSearch();
      // The pager pins a single category, so "All" doesn't apply there.
      if (_filter == 'all') {
        _filter = wardrobeCategories.firstWhere((c) => grouped[c]?.isNotEmpty ?? false, orElse: () => 'shirt');
      }
    }
    setState(() => _mode = mode);
  }

  Future<void> _openFilter() async {
    final picked = await showFlairSheet<String>(
      context,
      builder: (_) => _FilterSheet(initial: _filter, excludeAll: _mode == WardrobeMode.grid),
    );
    if (picked != null) setState(() => _filter = picked);
  }

  @override
  Widget build(BuildContext context) {
    final itemsAsync = ref.watch(wardrobeItemsProvider);
    final grouped = groupWardrobeItems(itemsAsync.valueOrNull ?? const [], _query);
    final visible = wardrobeCategories.where((c) => _filter == 'all' || c == _filter);
    final keyboardVisible = MediaQuery.viewInsetsOf(context).bottom > 0;
    final barHeight = tabBarHeight(context);

    Future<void> refresh() => ref.refresh(wardrobeItemsProvider.future);

    Widget body;
    if (itemsAsync.isLoading) {
      body = const Center(child: CircularProgressIndicator());
    } else if (itemsAsync.hasError) {
      body = RefreshIndicator(
        onRefresh: refresh,
        child: ListView(children: [
          Padding(
            padding: const EdgeInsets.all(32),
            child: Text('${itemsAsync.error}', textAlign: TextAlign.center, style: const TextStyle(color: Color(0xFFEF4444))),
          ),
        ]),
      );
    } else if (_mode == WardrobeMode.grid) {
      body = _ItemPager(items: [for (final c in visible) ...?grouped[c]], query: _query);
    } else {
      body = RefreshIndicator(
        onRefresh: refresh,
        child: ListView(
          keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
          padding: const EdgeInsets.only(bottom: 140),
          children: [
            for (final c in visible)
              if (grouped[c]?.isNotEmpty ?? false) _CategorySection(label: _sectionLabels[c]!, items: grouped[c]!, query: _query),
          ],
        ),
      );
    }

    return Scaffold(
      backgroundColor: const Color(0xFFE5E5E5),
      resizeToAvoidBottomInset: false,
      body: Stack(
        children: [
          Padding(
            padding: EdgeInsets.only(top: 64, bottom: barHeight),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
                  child: Row(
                    children: [
                      const Expanded(
                        child: Text.rich(TextSpan(style: _bebas, children: [
                          TextSpan(text: 'WA'),
                          TextSpan(text: 'R', style: _kirang),
                          TextSpan(text: 'DRO'),
                          TextSpan(text: 'B', style: _kirang),
                          TextSpan(text: 'E'),
                        ])),
                      ),
                      Image.asset('assets/share.png', width: 24, height: 24, color: Colors.black),
                      const SizedBox(width: 16),
                      GestureDetector(
                        key: const Key('wardrobe_menu'),
                        onTap: () => ProfileSheet.show(context),
                        child: Image.asset('assets/list.png', width: 24, height: 24, color: Colors.black),
                      ),
                    ],
                  ),
                ),
                Expanded(child: body),
                // Reserve the toolbar's height so content isn't hidden under it.
                const SizedBox(height: 64),
              ],
            ),
          ),
          Positioned(
            left: 0,
            right: 0,
            bottom: keyboardVisible ? MediaQuery.viewInsetsOf(context).bottom : barHeight,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (_searchOpen)
                  Container(
                    height: 72,
                    color: const Color(0xFFE5E5E5),
                    padding: const EdgeInsets.fromLTRB(20, 12, 20, 20),
                    child: Container(
                      height: 40,
                      padding: const EdgeInsets.symmetric(horizontal: 12),
                      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(99)),
                      child: Row(
                        children: [
                          Image.asset('assets/magnifying-glass.png', width: 24, height: 24, color: Colors.black),
                          const SizedBox(width: 8),
                          Expanded(
                            child: TextField(
                              key: const Key('wardrobe_search'),
                              controller: _searchController,
                              autofocus: true,
                              textAlign: TextAlign.center,
                              textInputAction: TextInputAction.search,
                              cursorColor: const Color(0xFFFF0D00),
                              onChanged: (v) => setState(() => _query = v),
                              style: _funnel.copyWith(fontSize: 16, height: 22 / 16, letterSpacing: -0.16),
                              decoration: const InputDecoration(
                                isCollapsed: true,
                                border: InputBorder.none,
                                hintText: 'Search',
                                hintStyle: TextStyle(color: Color(0xFF9CA3AF)),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                if (!keyboardVisible)
                  _Toolbar(
                    mode: _mode,
                    filterLabel: _filter == 'all' ? 'All' : wardrobeCategoryLabels[_filter]!,
                    onMode: (m) => _setMode(m, grouped),
                    onSort: _openFilter,
                    onSearch: () => _searchOpen ? _closeSearch() : setState(() => _searchOpen = true),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Wraps case-insensitive occurrences of [query] in a white highlight.
TextSpan _highlight(String text, String query, TextStyle style) {
  final q = query.trim().toLowerCase();
  if (q.isEmpty) return TextSpan(text: text, style: style);
  final lc = text.toLowerCase();
  final spans = <TextSpan>[];
  var i = 0;
  while (i < text.length) {
    final idx = lc.indexOf(q, i);
    if (idx == -1) {
      spans.add(TextSpan(text: text.substring(i)));
      break;
    }
    if (idx > i) spans.add(TextSpan(text: text.substring(i, idx)));
    spans.add(TextSpan(text: text.substring(idx, idx + q.length), style: const TextStyle(backgroundColor: Colors.white)));
    i = idx + q.length;
  }
  return TextSpan(style: style, children: spans);
}

class _Toolbar extends StatelessWidget {
  const _Toolbar({required this.mode, required this.filterLabel, required this.onMode, required this.onSort, required this.onSearch});

  final WardrobeMode mode;
  final String filterLabel;
  final ValueChanged<WardrobeMode> onMode;
  final VoidCallback onSort;
  final VoidCallback onSearch;

  Widget _modeButton(WardrobeMode m, String asset, Key key) => GestureDetector(
        key: key,
        onTap: () => onMode(m),
        child: Container(
          width: 54,
          height: 36,
          alignment: Alignment.center,
          decoration: BoxDecoration(color: mode == m ? Colors.white : Colors.transparent, borderRadius: BorderRadius.circular(99)),
          child: Image.asset(asset, width: 20, height: 20, color: Colors.black),
        ),
      );

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 64,
      color: const Color(0xFFE5E5E5),
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
      child: Row(
        children: [
          Container(
            width: 112,
            height: 40,
            padding: const EdgeInsets.all(2),
            decoration: BoxDecoration(color: const Color(0xFFD1D1D1), borderRadius: BorderRadius.circular(99)),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                _modeButton(WardrobeMode.grid, 'assets/t-shirt.png', const Key('wardrobe_mode_grid')),
                _modeButton(WardrobeMode.list, 'assets/dots-nine.png', const Key('wardrobe_mode_list')),
              ],
            ),
          ),
          const Spacer(),
          GestureDetector(
            key: const Key('wardrobe_sort'),
            behavior: HitTestBehavior.opaque,
            onTap: onSort,
            child: Row(
              children: [
                Image.asset('assets/sort.png', width: 22, height: 22, color: Colors.black),
                const SizedBox(width: 6),
                Text(filterLabel, style: _funnel.copyWith(fontSize: 16, height: 22 / 16, letterSpacing: -0.16)),
              ],
            ),
          ),
          if (mode == WardrobeMode.list) ...[
            const SizedBox(width: 4),
            GestureDetector(
              key: const Key('wardrobe_search_toggle'),
              onTap: onSearch,
              child: Padding(
                padding: const EdgeInsets.all(8),
                child: Image.asset('assets/magnifying-glass.png', width: 22, height: 22, color: Colors.black),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _CategorySection extends StatelessWidget {
  const _CategorySection({required this.label, required this.items, required this.query});

  final String label;
  final List<Map<String, dynamic>> items;
  final String query;

  @override
  Widget build(BuildContext context) {
    const rule = ColoredBox(color: Color(0x1A000000), child: SizedBox(height: 1));
    final count = query.trim().isEmpty ? '${items.length}' : '${items.length} ${items.length == 1 ? 'result' : 'results'}';
    return Padding(
      padding: const EdgeInsets.only(bottom: 20),
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Row(
              children: [
                const SizedBox(width: 24, child: rule),
                const SizedBox(width: 8),
                Text(label, style: _funnel.copyWith(fontSize: 14, height: 18 / 14, fontWeight: FontWeight.bold)),
                const SizedBox(width: 8),
                const Expanded(child: rule),
                const SizedBox(width: 8),
                Text(count, style: _funnel.copyWith(fontSize: 12, height: 1, color: const Color(0xFF666666))),
                const SizedBox(width: 8),
                const SizedBox(width: 24, child: rule),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            child: LayoutBuilder(
              builder: (context, c) {
                final gap = ((c.maxWidth - 330) / 2).clamp(0.0, double.infinity);
                return Wrap(
                  spacing: gap,
                  runSpacing: 8,
                  children: [for (final item in items) _ItemCellCompact(item: item, query: query)],
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _ItemCellCompact extends StatelessWidget {
  const _ItemCellCompact({required this.item, required this.query});

  final Map<String, dynamic> item;
  final String query;

  @override
  Widget build(BuildContext context) {
    final name = item['name'] as String?;
    final label = name ?? item['brand'] as String? ?? 'Unnamed';
    final style = _funnel.copyWith(fontSize: 12, height: 16 / 12, letterSpacing: 0.06);
    return SizedBox(
      width: 110,
      child: Column(
        children: [
          AspectRatio(aspectRatio: 1, child: _netImage(item['imageUrl'] as String?)),
          const SizedBox(height: 4),
          // Only highlight when the label is the name; brand fallbacks aren't matched.
          Text.rich(name != null ? _highlight(label, query, style) : TextSpan(text: label, style: style), maxLines: 2, textAlign: TextAlign.center),
        ],
      ),
    );
  }
}

Widget _netImage(String? url, {double? height}) => url == null || url.isEmpty
    ? SizedBox(height: height)
    : Image.network(url, height: height, width: double.infinity, fit: BoxFit.contain, errorBuilder: (_, __, ___) => SizedBox(height: height));

class _ItemPager extends StatelessWidget {
  const _ItemPager({required this.items, required this.query});

  final List<Map<String, dynamic>> items;
  final String query;

  @override
  Widget build(BuildContext context) {
    return PageView(children: [for (final item in items) _ItemCardLarge(item: item, query: query)]);
  }
}

/// Full-width card: garment on a hanger with a rod split around the hook so
/// the hook wraps over the left half and the shoulder sits over the right.
class _ItemCardLarge extends StatelessWidget {
  const _ItemCardLarge({required this.item, required this.query});

  final Map<String, dynamic> item;
  final String query;

  static const double _barTop = 16 + 36;

  @override
  Widget build(BuildContext context) {
    final name = item['name'] as String?;
    final heading = name ?? item['brand'] as String? ?? 'Unnamed';
    final category = item['category'] as String?;
    final subtitle = [wardrobeCategoryLabels[category], item['brand']].whereType<String>().where((s) => s.isNotEmpty).join(' • ');
    final description = item['customNotes'] as String? ?? '';
    final outfitCount = (item['outfitCount'] as num?)?.toInt() ?? 0;
    final showBar = category != 'headwear' && category != 'footwear';
    final headingStyle = _funnel.copyWith(fontSize: 20, height: 24 / 20, fontWeight: FontWeight.bold, letterSpacing: -0.3);
    final small = _funnel.copyWith(fontSize: 12, height: 16 / 12, letterSpacing: 0.06);

    Widget bar(Alignment side) => Positioned(
          top: _barTop,
          left: side == Alignment.centerLeft ? 0 : null,
          right: side == Alignment.centerRight ? 0 : null,
          width: (MediaQuery.sizeOf(context).width - 40) / 2,
          height: 8,
          child: ClipRect(
            child: OverflowBox(
              alignment: side,
              maxWidth: MediaQuery.sizeOf(context).width - 40,
              child: Image.asset('assets/bar.png', width: MediaQuery.sizeOf(context).width - 40, height: 8, fit: BoxFit.fill),
            ),
          ),
        );

    return SingleChildScrollView(
      padding: const EdgeInsets.symmetric(horizontal: 20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const ColoredBox(color: Color(0xFFD8D8D8), child: SizedBox(height: 1)),
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 16),
            child: Stack(
              clipBehavior: Clip.none,
              children: [
                if (showBar) bar(Alignment.centerLeft),
                _netImage(item['imageUrl'] as String?, height: 320),
                if (showBar) bar(Alignment.centerRight),
              ],
            ),
          ),
          Text.rich(name != null ? _highlight(heading, query, headingStyle) : TextSpan(text: heading, style: headingStyle), maxLines: 1, textAlign: TextAlign.center),
          if (outfitCount > 0)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text('Used in', style: small.copyWith(color: Colors.black54)),
                  const SizedBox(width: 4),
                  Image.asset('assets/bookmark-simple-filled.png', width: 14, height: 14, color: const Color(0xFFFF0D00)),
                  const SizedBox(width: 4),
                  Text('$outfitCount ${outfitCount == 1 ? 'outfit' : 'outfits'}', style: small.copyWith(color: const Color(0xFFFF0D00))),
                ],
              ),
            ),
          if (subtitle.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text(subtitle, maxLines: 1, textAlign: TextAlign.center, style: _funnel.copyWith(fontSize: 14, height: 18 / 14)),
            ),
          if (description.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 16),
              child: Text(description, maxLines: 3, textAlign: TextAlign.center, style: _funnel.copyWith(fontSize: 14, height: 18 / 14, color: const Color(0xFF8F8F8F))),
            ),
        ],
      ),
    );
  }
}

class _FilterSheet extends StatefulWidget {
  const _FilterSheet({required this.initial, required this.excludeAll});

  final String initial;
  final bool excludeAll;

  @override
  State<_FilterSheet> createState() => _FilterSheetState();
}

class _FilterSheetState extends State<_FilterSheet> {
  late String _pending = widget.initial;

  @override
  Widget build(BuildContext context) {
    const kirang = TextStyle(fontFamily: 'KirangHaerang', fontSize: 44, height: 40 / 44, color: Colors.black);
    const bebas = TextStyle(fontFamily: 'BebasNeue', fontSize: 36, height: 40 / 36, color: Colors.black);
    final options = ['all', ...wardrobeCategories].where((o) => !widget.excludeAll || o != 'all');
    return Padding(
      padding: const EdgeInsets.only(bottom: 24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Padding(
            padding: EdgeInsets.fromLTRB(20, 20, 20, 12),
            child: Text.rich(TextSpan(children: [
              TextSpan(text: 'F', style: kirang),
              TextSpan(text: 'IL', style: bebas),
              TextSpan(text: 'T', style: kirang),
              TextSpan(text: 'ER', style: bebas),
            ])),
          ),
          const Divider(height: 1, thickness: 1, color: Color(0xFFE5E5E5)),
          for (final opt in options)
            GestureDetector(
              key: Key('filter_chip_$opt'),
              behavior: HitTestBehavior.opaque,
              onTap: () => setState(() => _pending = opt),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 18),
                decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: Color(0xFFE5E5E5)))),
                alignment: Alignment.centerLeft,
                child: Stack(
                  clipBehavior: Clip.none,
                  children: [
                    Text(
                      opt == 'all' ? 'All' : wardrobeCategoryLabels[opt]!,
                      style: _funnel.copyWith(
                        fontSize: 16,
                        height: 22 / 16,
                        letterSpacing: -0.16,
                        fontWeight: opt == _pending ? FontWeight.bold : FontWeight.normal,
                        color: opt == _pending ? const Color(0xFFFF0D00) : Colors.black,
                      ),
                    ),
                    if (opt == _pending)
                      Positioned(left: 0, right: 0, bottom: -4, height: 4, child: Image.asset('assets/underline.png', fit: BoxFit.fill)),
                  ],
                ),
              ),
            ),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 20, 20, 0),
            child: SizedBox(
              height: 56,
              child: ElevatedButton.icon(
                key: const Key('filter_done'),
                onPressed: () => Navigator.of(context).pop(_pending),
                icon: Image.asset('assets/check.png', width: 18, height: 18, color: Colors.white),
                label: const Text('Save'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.black,
                  foregroundColor: Colors.white,
                  elevation: 0,
                  shape: const StadiumBorder(),
                  textStyle: const TextStyle(fontFamily: 'FunnelSans', fontSize: 16, height: 24 / 16, fontWeight: FontWeight.w500, letterSpacing: -0.24),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
