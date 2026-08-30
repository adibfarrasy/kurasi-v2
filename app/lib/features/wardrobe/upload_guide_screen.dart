import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_typography.dart';

/// Upload-wardrobe guide: DO/DON'T cards plus a photo multi-select (max 10).
/// Picks images via [ImagePicker] (camera or library) and pushes the
/// processing screen with the selected file uris as a JSON list.
class UploadWardrobeGuideScreen extends ConsumerStatefulWidget {
  const UploadWardrobeGuideScreen({super.key});

  @override
  ConsumerState<UploadWardrobeGuideScreen> createState() =>
      _UploadWardrobeGuideScreenState();
}

class _UploadWardrobeGuideScreenState
    extends ConsumerState<UploadWardrobeGuideScreen> {
  static const _maxPhotos = 10;

  final List<XFile> _selected = [];

  Future<void> _addPhotos() async {
    final source = await showModalBottomSheet<ImageSource>(
      context: context,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (_) => const _SourceSheet(),
    );
    if (source == null || !mounted) return;

    final picker = ImagePicker();
    final remaining = _maxPhotos - _selected.length;
    List<XFile> picked = const [];
    try {
      if (source == ImageSource.camera) {
        final one = await picker.pickImage(
          source: source,
          maxWidth: 1600,
          imageQuality: 90,
        );
        if (one != null) picked = [one];
      } else {
        picked = await picker.pickMultiImage(
          maxWidth: 1600,
          imageQuality: 90,
          limit: remaining,
        );
      }
    } catch (_) {
      picked = const [];
    }
    if (!mounted || picked.isEmpty) return;
    setState(() {
      _selected.addAll(picked.take(remaining));
    });
  }

  void _removeAt(int index) {
    setState(() => _selected.removeAt(index));
  }

  void _startUpload() {
    final uris = _selected.map((f) => f.path).toList();
    final encoded = Uri.encodeQueryComponent(jsonEncode(uris));
    context.push('/upload-wardrobe?uris=$encoded');
  }

  @override
  Widget build(BuildContext context) {
    final count = _selected.length;
    final canAddMore = count < _maxPhotos;
    return Scaffold(
      backgroundColor: AppColors.page,
      body: Stack(
        children: [
          SafeArea(
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(20, 24, 20, 160),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const _Title(),
                  const SizedBox(height: 4),
                  Text(
                    'Add clothes to your wardrobe',
                    style: AppTypography.body
                        .copyWith(color: AppColors.textPrimary),
                  ),
                  const SizedBox(height: 32),
                  const _GuideCard(
                    kind: 'do',
                    title: 'DO',
                    body: 'Photo each item\nby itself.',
                    caption:
                        'Flat lay or hanging against a plain background works best.',
                  ),
                  const SizedBox(height: 17),
                  const _GuideCard(
                    kind: 'dont',
                    title: "DON'T",
                    body: 'Wear the item or\ninclude other clothes.',
                    caption: 'We need a clean, full view of the garment.',
                  ),
                  if (count > 0) ...[
                    const SizedBox(height: 24),
                    Row(
                      children: [
                        Text(
                          'Selected',
                          style: AppTypography.body
                              .copyWith(color: AppColors.textPrimary),
                        ),
                        const Spacer(),
                        Text(
                          '$count / $_maxPhotos',
                          style: AppTypography.caption
                              .copyWith(color: AppColors.textMuted),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    GridView.builder(
                      shrinkWrap: true,
                      physics: const NeverScrollableScrollPhysics(),
                      gridDelegate:
                          const SliverGridDelegateWithFixedCrossAxisCount(
                        crossAxisCount: 3,
                        mainAxisSpacing: 8,
                        crossAxisSpacing: 8,
                        childAspectRatio: 1,
                      ),
                      itemCount: count + (canAddMore ? 1 : 0),
                      itemBuilder: (context, index) {
                        if (index == count) {
                          return _AddMoreTile(onTap: _addPhotos);
                        }
                        return _SelectedThumb(
                          file: _selected[index],
                          onRemove: () => _removeAt(index),
                        );
                      },
                    ),
                  ],
                ],
              ),
            ),
          ),
          Positioned(
            top: MediaQuery.paddingOf(context).top + 12,
            right: 20,
            child: IconButton(
              key: const ValueKey('ww_close'),
              onPressed: () => context.pop(),
              icon: const Icon(Icons.close,
                  color: AppColors.textPrimary, size: 24),
            ),
          ),
          Positioned(
            left: 20,
            right: 20,
            bottom: MediaQuery.paddingOf(context).bottom + 16,
            child: SizedBox(
              height: 56,
              child: ElevatedButton.icon(
                key: ValueKey(count == 0 ? 'ww_add_photos' : 'ww_upload'),
                onPressed: count == 0 ? _addPhotos : _startUpload,
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.dark,
                  foregroundColor: Colors.white,
                  elevation: 0,
                  shape: const StadiumBorder(),
                ),
                icon: Icon(
                  count == 0
                      ? Icons.add_photo_alternate_outlined
                      : Icons.arrow_forward,
                  size: 20,
                ),
                label: Text(
                  count == 0
                      ? 'Choose Photos'
                      : 'Upload $count ${count == 1 ? 'photo' : 'photos'}',
                  style: AppTypography.buttonLabel,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Camera / library chooser that returns the selected [ImageSource].
class _SourceSheet extends StatelessWidget {
  const _SourceSheet();

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Padding(
            padding: EdgeInsets.only(top: 16),
            child: Text(
              'Add photos',
              style: TextStyle(
                fontFamily: 'FunnelSans',
                fontSize: 16,
                fontWeight: FontWeight.w700,
                color: AppColors.textPrimary,
              ),
            ),
          ),
          ListTile(
            key: const ValueKey('ww_source_camera'),
            leading: const Icon(Icons.photo_camera_outlined,
                color: AppColors.textPrimary),
            title: const Text('Take Photo', style: AppTypography.body),
            onTap: () => Navigator.of(context).pop(ImageSource.camera),
          ),
          ListTile(
            key: const ValueKey('ww_source_library'),
            leading: const Icon(Icons.photo_library_outlined,
                color: AppColors.textPrimary),
            title: const Text('Choose from Library', style: AppTypography.body),
            onTap: () => Navigator.of(context).pop(ImageSource.gallery),
          ),
          const SizedBox(height: 8),
        ],
      ),
    );
  }
}

class _Title extends StatelessWidget {
  const _Title();

  @override
  Widget build(BuildContext context) {
    const bebas = TextStyle(
      fontFamily: 'BebasNeue',
      fontSize: 36,
      height: 40 / 36,
      letterSpacing: 0.5,
      color: AppColors.textPrimary,
    );
    const kirang = TextStyle(
      fontFamily: 'KirangHaerang',
      fontSize: 44,
      height: 44 / 44,
      color: AppColors.textPrimary,
    );
    return const Text.rich(
      TextSpan(
        style: bebas,
        children: [
          TextSpan(text: 'UP'),
          TextSpan(text: 'L', style: kirang),
          TextSpan(text: 'OAD WAR'),
          TextSpan(text: 'D', style: kirang),
          TextSpan(text: 'R'),
          TextSpan(text: 'O', style: kirang),
          TextSpan(text: 'BE'),
        ],
      ),
    );
  }
}

/// A DO/DON'T guide card. The DO card sits on a white panel with the torn
/// paper top edge; the DON'T card sits directly on the page background.
class _GuideCard extends StatelessWidget {
  const _GuideCard({
    required this.kind,
    required this.title,
    required this.body,
    required this.caption,
  });

  final String kind;
  final String title;
  final String body;
  final String caption;

  @override
  Widget build(BuildContext context) {
    final isDo = kind == 'do';
    final accent = isDo ? AppColors.doGreen : AppColors.dontRed;
    return Container(
      decoration: BoxDecoration(
        color: isDo ? Colors.white : Colors.transparent,
        borderRadius: BorderRadius.circular(4),
      ),
      clipBehavior: Clip.hardEdge,
      child: Column(
        children: [
          if (isDo) const _TopFlair(),
          Padding(
            padding: const EdgeInsets.fromLTRB(4, 4, 16, 4),
            child: Row(
              children: [
                Container(
                  width: 107,
                  height: 160,
                  decoration: BoxDecoration(
                    color: AppColors.page,
                    borderRadius: BorderRadius.circular(1),
                  ),
                  child: Icon(
                    isDo ? Icons.checkroom : Icons.person,
                    color: AppColors.textMuted,
                    size: 40,
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: SizedBox(
                    height: 160,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Spacer(),
                        Row(
                          children: [
                            Icon(
                              isDo ? Icons.check_circle : Icons.cancel,
                              color: accent,
                              size: 20,
                            ),
                            const SizedBox(width: 6),
                            Text(
                              title,
                              style: TextStyle(
                                fontFamily: 'FunnelSans',
                                fontSize: 16,
                                height: 22 / 16,
                                letterSpacing: -0.16,
                                fontWeight:
                                    isDo ? FontWeight.w700 : FontWeight.w400,
                                color: accent,
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 4),
                        Text(
                          body,
                          style: const TextStyle(
                            fontFamily: 'FunnelSans',
                            fontSize: 16,
                            height: 22 / 16,
                            letterSpacing: -0.16,
                            color: AppColors.textPrimary,
                          ),
                        ),
                        const Spacer(),
                        Text(
                          caption,
                          style: AppTypography.caption
                              .copyWith(color: AppColors.textSecondary),
                        ),
                      ],
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

/// Torn-paper top edge, repeating `top-flair.png` (393x12) to cover the width.
class _TopFlair extends StatelessWidget {
  const _TopFlair();

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 12,
      child: Row(
        children: [
          Expanded(
              child: Image.asset('assets/top-flair.png',
                  height: 12, fit: BoxFit.fill)),
          const SizedBox(width: 6),
          Expanded(
              child: Image.asset('assets/top-flair.png',
                  height: 12, fit: BoxFit.fill)),
        ],
      ),
    );
  }
}

class _SelectedThumb extends StatelessWidget {
  const _SelectedThumb({required this.file, required this.onRemove});

  final XFile file;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    return Stack(
      fit: StackFit.expand,
      children: [
        ClipRRect(
          borderRadius: BorderRadius.circular(10),
          child: Image.file(
            File(file.path),
            fit: BoxFit.cover,
            errorBuilder: (_, __, ___) =>
                const ColoredBox(color: AppColors.chip),
          ),
        ),
        Positioned(
          top: 4,
          right: 4,
          child: InkWell(
            onTap: onRemove,
            customBorder: const CircleBorder(),
            child: Container(
              width: 24,
              height: 24,
              decoration: const BoxDecoration(
                color: AppColors.dark,
                shape: BoxShape.circle,
              ),
              child: const Icon(Icons.close,
                  color: Colors.white, size: 16),
            ),
          ),
        ),
      ],
    );
  }
}

class _AddMoreTile extends StatelessWidget {
  const _AddMoreTile({required this.onTap});

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      key: const ValueKey('ww_add_more'),
      onTap: onTap,
      borderRadius: BorderRadius.circular(10),
      child: Container(
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: AppColors.hairline),
        ),
        child: const Icon(Icons.add, color: AppColors.textMuted, size: 32),
      ),
    );
  }
}