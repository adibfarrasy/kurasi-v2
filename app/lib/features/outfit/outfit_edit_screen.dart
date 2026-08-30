import 'dart:io';
import 'dart:math' as math;
import 'dart:ui' show ImageByteFormat;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:share_plus/share_plus.dart';
import '../../core/api/wardrobe_items_provider.dart';
import '../../core/design/signature_pad.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_typography.dart';
import '../myfit/outfits_provider.dart';
import '../onboarding/signature_state.dart';
import '../tryon/hero_floor.dart';
import '../tryon/tone_background.dart';
import '../wardrobe/wardrobe_ui_provider.dart';
import 'outfit_detail_screen.dart';

typedef _EditTool = ({String label, String key});

const List<_EditTool> _tools = [
  (label: 'Canvas', key: 'canvas'),
  (label: 'Background', key: 'background'),
  (label: 'Items', key: 'items'),
];

const List<({String label, double ratio})> _aspectRatios = [
  (label: '9:16', ratio: 9 / 16),
  (label: '4:5', ratio: 4 / 5),
  (label: '3:4', ratio: 3 / 4),
  (label: '1:1', ratio: 1),
];

const List<({String label, String value})> _backgrounds = [
  (label: 'Transparent', value: 'transparent'),
  (label: 'Neutral', value: 'neutral'),
  (label: 'Cool', value: 'cool'),
  (label: 'Warm', value: 'warm'),
];

const Map<String, Color> _backgroundSwatches = {
  'neutral': Color(0xFFF0F0F0),
  'cool': Color(0xFFA8C4E0),
  'warm': Color(0xFFC9B89D),
};

/// Outfit share-canvas editor. The user re-frames the look (aspect ratio,
/// backdrop, item-callout overlay) then taps Share to render the canvas to a
/// PNG and hand it to the native share sheet via `share_plus`.
class OutfitEditScreen extends ConsumerStatefulWidget {
  const OutfitEditScreen({super.key, required this.id});

  final String id;

  @override
  ConsumerState<OutfitEditScreen> createState() => _OutfitEditScreenState();
}

class _OutfitEditScreenState extends ConsumerState<OutfitEditScreen> {
  final _canvasKey = GlobalKey();
  String? _tool;
  double _aspectRatio = 9 / 16;
  String _background = 'warm';
  bool _itemsVisible = true;
  bool _sharing = false;

  Future<void> _share() async {
    if (_sharing) return;
    setState(() => _sharing = true);
    try {
      final renderObject =
          _canvasKey.currentContext?.findRenderObject() as RenderRepaintBoundary?;
      if (renderObject == null) return;
      final image = await renderObject.toImage(pixelRatio: 2);
      final byteData = await image.toByteData(format: ImageByteFormat.png);
      if (byteData == null) return;
      final dir = await Directory.systemTemp.createTemp('kurasi_share');
      final file = File('${dir.path}/outfit_${widget.id}.png');
      await file.writeAsBytes(byteData.buffer.asUint8List());
      await SharePlus.instance.share(
        ShareParams(files: [XFile(file.path)], text: 'My fit'),
      );
    } catch (_) {
      // Sharing may fail on platforms without a share sheet; stay quiet.
    } finally {
      if (mounted) setState(() => _sharing = false);
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
    final signaturePaths = ref.watch(signaturePathsProvider);

    return Scaffold(
      backgroundColor: AppColors.myFitPage,
      body: outfits.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => const Center(child: Text('Failed to load outfit')),
        data: (_) {
          final outfit = outfitById(outfits.valueOrNull ?? [], widget.id);
          if (outfit == null) {
            return const Center(child: Text('Outfit not found'));
          }
          return SafeArea(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _EditHeader(
                  onBack: () => context.pop(),
                  onShare: _share,
                  sharing: _sharing,
                ),
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(20, 11, 20, 0),
                    child: LayoutBuilder(
                      builder: (context, constraints) {
                        final canvasWidth = math.min(
                            constraints.maxWidth,
                            constraints.maxHeight * _aspectRatio);
                        final canvasHeight =
                            canvasWidth / _aspectRatio;
                        return Center(
                          child: RepaintBoundary(
                            key: _canvasKey,
                            child: SizedBox(
                              key: const ValueKey('edit_canvas'),
                              width: canvasWidth,
                              height: canvasHeight,
                              child: ClipRect(
                                child: Stack(
                                  fit: StackFit.expand,
                                  children: [
                                    _CanvasBackdrop(
                                        background: _background,
                                        outfit: outfit),
                                    if (_itemsVisible)
                                      _CanvasItemsStrip(
                                        outfit: outfit,
                                        itemsById: itemsById,
                                        canvasWidth: canvasWidth,
                                      ),
                                    if (signaturePaths.isNotEmpty)
                                      Positioned(
                                        left: 16,
                                        bottom: 16,
                                        width: canvasWidth * 0.32,
                                        child: SizedBox(
                                          height: 40,
                                          child: FittedBox(
                                            fit: BoxFit.contain,
                                            alignment: Alignment.centerLeft,
                                            child: SizedBox(
                                              width: 320,
                                              height: 40,
                                              child: CustomPaint(
                                                painter: SignaturePainter(
                                                  paths: signaturePaths,
                                                  color: Colors.white,
                                                  strokeWidth: 2,
                                                ),
                                              ),
                                            ),
                                          ),
                                        ),
                                      ),
                                  ],
                                ),
                              ),
                            ),
                          ),
                        );
                      },
                    ),
                  ),
                ),
                _BottomStrip(
                  tool: _tool,
                  aspectRatio: _aspectRatio,
                  background: _background,
                  itemsVisible: _itemsVisible,
                  onTool: (tool) =>
                      setState(() => _tool = _tool == tool ? null : tool),
                  onAspectRatio: (ratio) =>
                      setState(() => _aspectRatio = ratio),
                  onBackground: (value) =>
                      setState(() => _background = value),
                  onItemsVisible: (value) =>
                      setState(() => _itemsVisible = value),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}

class _EditHeader extends StatelessWidget {
  const _EditHeader({
    required this.onBack,
    required this.onShare,
    required this.sharing,
  });

  final VoidCallback onBack;
  final VoidCallback onShare;
  final bool sharing;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 56,
      child: Stack(
        alignment: Alignment.center,
        children: [
          const Positioned.fill(
            child: IgnorePointer(
              child: Center(
                child: Text(
                  'EDIT',
                  style: TextStyle(
                    fontFamily: 'BebasNeue',
                    fontSize: 36,
                    height: 40 / 36,
                    color: AppColors.textPrimary,
                  ),
                ),
              ),
            ),
          ),
          Align(
            alignment: Alignment.centerLeft,
            child: IconButton(
              key: const ValueKey('outfit_edit_back'),
              onPressed: onBack,
              icon: const Icon(Icons.arrow_back_rounded,
                  color: AppColors.textPrimary, size: 24),
            ),
          ),
          Align(
            alignment: Alignment.centerRight,
            child: GestureDetector(
              key: const ValueKey('outfit_edit_share'),
              onTap: sharing ? null : onShare,
              child: Container(
                margin: const EdgeInsets.only(right: 20),
                padding:
                    const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                decoration: BoxDecoration(
                  color: sharing ? AppColors.disabled : AppColors.dark,
                  borderRadius: BorderRadius.circular(99),
                ),
                child: Text(
                  'Share',
                  style: AppTypography.buttonLabel
                      .copyWith(color: Colors.white, fontSize: 14),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Canvas backdrop: 'transparent' falls through to the page background, the
/// other selections reuse the studio ToneBackground gradients.
class _CanvasBackdrop extends StatelessWidget {
  const _CanvasBackdrop({required this.background, required this.outfit});

  final String background;
  final Map<String, dynamic> outfit;

  @override
  Widget build(BuildContext context) {
    final hero = outfit['heroImageUrl'] as String?;
    final image = hero == null
        ? const ColoredBox(color: Colors.white)
        : Image.network(
            hero,
            fit: BoxFit.contain,
            loadingBuilder: (context, child, progress) =>
                progress == null ? child : const ColoredBox(color: Colors.white),
            errorBuilder: (context, error, stackTrace) =>
                const ColoredBox(color: Colors.white),
          );

    if (background == 'transparent') {
      return Center(child: image);
    }
    return ToneBackground(
      tone: background,
      child: Center(child: image),
    );
  }
}

/// Compact item-card overlay anchored just above the canvas bottom. Cards
/// scale down so all filled slots fit the canvas width.
class _CanvasItemsStrip extends StatelessWidget {
  const _CanvasItemsStrip({
    required this.outfit,
    required this.itemsById,
    required this.canvasWidth,
  });

  final Map<String, dynamic> outfit;
  final Map<String, Map<String, dynamic>> itemsById;
  final double canvasWidth;

  static const double _cardW = 64;
  static const double _cardH = 72;
  static const double _gap = 6;
  static const double _side = 12;

  @override
  Widget build(BuildContext context) {
    final slots = <Map<String, dynamic>>[];
    for (final category in wardrobeCategories) {
      final id = outfit[slotKeyForCategory(category)];
      if (id is! String) continue;
      final item = itemsById[id];
      if (item == null) continue;
      final url = item['imageUrl'];
      if (url is! String) continue;
      slots.add({
        'category': category,
        'imageUrl': url,
        'label': wardrobeCategoryLabels[category] ?? category,
      });
    }
    if (slots.isEmpty) return const SizedBox.shrink();

    final available = canvasWidth - _side * 2 - _gap * (slots.length - 1);
    final scale = math.min(1.0, available / (slots.length * _cardW));

    return Positioned(
      left: 0,
      right: 0,
      bottom: 16,
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          for (final slot in slots)
            Container(
              margin: const EdgeInsets.symmetric(horizontal: _gap / 2),
              width: _cardW * scale,
              height: _cardH * scale,
              clipBehavior: Clip.antiAlias,
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(6),
                border: Border.all(color: AppColors.hairline),
              ),
              child: Stack(
                fit: StackFit.expand,
                children: [
                  Image.network(
                    slot['imageUrl'] as String,
                    fit: BoxFit.cover,
                    loadingBuilder: (context, child, progress) =>
                        progress == null
                            ? child
                            : const ColoredBox(color: AppColors.chip),
                    errorBuilder: (context, error, stackTrace) =>
                        const ColoredBox(color: AppColors.chip),
                  ),
                  Positioned(
                    left: 0,
                    right: 0,
                    bottom: 0,
                    child: Container(
                      padding: const EdgeInsets.symmetric(vertical: 2),
                      decoration: const BoxDecoration(
                        color: Color(0xB3000000),
                      ),
                      child: Text(
                        slot['label'] as String,
                        textAlign: TextAlign.center,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontFamily: 'FunnelSans',
                          fontSize: 7,
                          fontWeight: FontWeight.w700,
                          color: Colors.white,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

class _BottomStrip extends StatelessWidget {
  const _BottomStrip({
    required this.tool,
    required this.aspectRatio,
    required this.background,
    required this.itemsVisible,
    required this.onTool,
    required this.onAspectRatio,
    required this.onBackground,
    required this.onItemsVisible,
  });

  final String? tool;
  final double aspectRatio;
  final String background;
  final bool itemsVisible;
  final ValueChanged<String> onTool;
  final ValueChanged<double> onAspectRatio;
  final ValueChanged<String> onBackground;
  final ValueChanged<bool> onItemsVisible;

  @override
  Widget build(BuildContext context) {
    if (tool == null) {
      return Padding(
        padding: const EdgeInsets.fromLTRB(20, 20, 20, 16),
        child: Row(
          children: [
            for (final t in _tools)
              Expanded(
                child: _ToolButton(
                  key: ValueKey('edit_tool_${t.key}'),
                  label: t.label,
                  onTap: () => onTool(t.key),
                ),
              ),
          ],
        ),
      );
    }

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        _PanelHeader(
          label: tool!,
          onSave: () => onTool(tool!),
        ),
        if (tool == 'canvas')
          _SegmentedSelector(
            options: [
              for (final r in _aspectRatios)
                (label: r.label, value: r.ratio),
            ],
            value: aspectRatio,
            onChanged: onAspectRatio,
          )
        else if (tool == 'background')
          _BackgroundSelector(value: background, onChanged: onBackground)
        else
          _SegmentedSelector(
            options: const [
              (label: 'Hide', value: false),
              (label: 'Show', value: true),
            ],
            value: itemsVisible,
            onChanged: onItemsVisible,
          ),
        const SizedBox(height: 16),
      ],
    );
  }
}

class _ToolButton extends StatelessWidget {
  const _ToolButton({super.key, required this.label, required this.onTap});

  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 44,
            height: 44,
            decoration: const BoxDecoration(
              color: Colors.white,
              shape: BoxShape.circle,
            ),
            child: const Icon(Icons.tune_rounded,
                color: AppColors.textSecondary, size: 24),
          ),
          const SizedBox(height: 6),
          Text(
            label,
            style: AppTypography.slotLabel
                .copyWith(color: AppColors.textSecondary),
          ),
        ],
      ),
    );
  }
}

class _PanelHeader extends StatelessWidget {
  const _PanelHeader({required this.label, required this.onSave});

  final String label;
  final VoidCallback onSave;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 12),
      decoration: const BoxDecoration(
        border: Border(top: BorderSide(color: Color(0xFFC8C8C8))),
      ),
      child: Row(
        children: [
          Text(
            label,
            style: AppTypography.body.copyWith(fontWeight: FontWeight.w700),
          ),
          const Spacer(),
          GestureDetector(
            onTap: onSave,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              decoration: BoxDecoration(
                color: AppColors.dark,
                borderRadius: BorderRadius.circular(99),
              ),
              child: const Text(
                'Save',
                style: TextStyle(
                  fontFamily: 'FunnelSans',
                  fontSize: 14,
                  height: 18 / 14,
                  color: Colors.white,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _SegmentedSelector<T> extends StatelessWidget {
  const _SegmentedSelector({
    required this.options,
    required this.value,
    required this.onChanged,
  });

  final List<({String label, T value})> options;
  final T value;
  final ValueChanged<T> onChanged;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 20),
      padding: const EdgeInsets.all(2),
      decoration: BoxDecoration(
        color: const Color(0xFFD6D6D6),
        borderRadius: BorderRadius.circular(40),
      ),
      child: Row(
        children: [
          for (final option in options)
            Expanded(
              child: GestureDetector(
                onTap: () => onChanged(option.value),
                child: Container(
                  padding: const EdgeInsets.symmetric(vertical: 10),
                  decoration: option.value == value
                      ? BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(40),
                        )
                      : null,
                  child: Text(
                    option.label,
                    textAlign: TextAlign.center,
                    style: AppTypography.caption.copyWith(
                      fontWeight: FontWeight.w700,
                      color: option.value == value
                          ? AppColors.textPrimary
                          : AppColors.textSecondary,
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _BackgroundSelector extends StatelessWidget {
  const _BackgroundSelector({required this.value, required this.onChanged});

  final String value;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 20),
      padding: const EdgeInsets.all(2),
      decoration: BoxDecoration(
        color: const Color(0xFFD6D6D6),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          for (final option in _backgrounds)
            Expanded(
              child: GestureDetector(
                onTap: () => onChanged(option.value),
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Container(
                        width: 28,
                        height: 28,
                        decoration: option.value == 'transparent'
                            ? BoxDecoration(
                                shape: BoxShape.circle,
                                border: Border.all(
                                  color: AppColors.textMuted,
                                  width: 1.5,
                                ),
                              )
                            : BoxDecoration(
                                shape: BoxShape.circle,
                                color: _backgroundSwatches[option.value],
                                border: option.value == value
                                    ? Border.all(
                                        color: AppColors.dark, width: 2)
                                    : null,
                              ),
                      ),
                      const SizedBox(height: 6),
                      Text(
                        option.label,
                        style: AppTypography.slotLabel.copyWith(
                          color: option.value == value
                              ? AppColors.textPrimary
                              : AppColors.textSecondary,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}