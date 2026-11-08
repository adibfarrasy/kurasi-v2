import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import '../../core/design/photo_source.dart';
import '../../core/design/flair_sheet.dart';
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

  Future<void> _addPhotos() async {
    final source = await pickPhotoSource(context);
    if (source == null || !mounted) return;

    final picker = ImagePicker();
    List<XFile> picked = const [];
    try {
      if (source == ImageSource.camera) {
        final one = await picker.pickImage(source: source, maxWidth: 1600, imageQuality: 90);
        if (one != null) picked = [one];
      } else {
        picked = await picker.pickMultiImage(maxWidth: 1600, imageQuality: 90, limit: _maxPhotos);
      }
    } catch (_) {
      picked = const [];
    }
    if (!mounted || picked.isEmpty) return;
    final encoded = Uri.encodeQueryComponent(jsonEncode([for (final f in picked.take(_maxPhotos)) f.path]));
    context.push('/upload-wardrobe?uris=$encoded');
  }

  @override
  Widget build(BuildContext context) {
    final insets = MediaQuery.paddingOf(context);
    return Scaffold(
      backgroundColor: AppColors.page,
      body: Stack(
        children: [
          SingleChildScrollView(
            padding: EdgeInsets.fromLTRB(20, insets.top + 24, 20, 140),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const _Title(),
                const SizedBox(height: 4),
                Text('Upload a clothing item', style: AppTypography.body.copyWith(color: AppColors.textPrimary)),
                const SizedBox(height: 32),
                const _GuideCard(kind: 'do', title: 'DO', body: 'One item per photo.\nLay flat, not folded.\nFront view.', caption: ''),
                const SizedBox(height: 17),
                const _GuideCard(kind: 'dont', title: "DON'T", body: 'Multiple clothing articles in the frame.\nCropped image.', caption: ''),
              ],
            ),
          ),
          Positioned(
            top: insets.top + 12,
            right: 20,
            child: GestureDetector(
              key: const ValueKey('ww_close'),
              onTap: () => context.pop(),
              child: Image.asset('assets/x.png', width: 24, height: 24, color: Colors.black),
            ),
          ),
          Positioned(
            left: 20,
            right: 20,
            bottom: insets.bottom + 16,
            child: GestureDetector(
              key: const ValueKey('ww_add_photos'),
              onTap: _addPhotos,
              child: Container(
                height: 56,
                decoration: BoxDecoration(color: Colors.black, borderRadius: BorderRadius.circular(99)),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Image.asset('assets/picture.png', width: 24, height: 20, color: Colors.white),
                    const SizedBox(width: 10),
                    const Text('Upload image(s)', style: TextStyle(fontFamily: 'FunnelSans', fontSize: 16, height: 24 / 16, letterSpacing: -0.24, fontWeight: FontWeight.w500, color: Colors.white)),
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

class _Title extends StatelessWidget {
  const _Title();

  @override
  Widget build(BuildContext context) {
    const kirang = TextStyle(fontFamily: 'KirangHaerang', fontSize: 58, height: 52 / 58);
    return const Text.rich(TextSpan(
      style: TextStyle(fontFamily: 'BebasNeue', fontSize: 48, height: 52 / 48, color: Colors.black),
      children: [
        TextSpan(text: 'U'),
        TextSpan(text: 'P', style: kirang),
        TextSpan(text: 'LO'),
        TextSpan(text: 'A', style: kirang),
        TextSpan(text: 'D WA'),
        TextSpan(text: 'R', style: kirang),
        TextSpan(text: 'DRO'),
        TextSpan(text: 'B', style: kirang),
        TextSpan(text: 'E'),
      ],
    ));
  }
}

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
          if (isDo) const TopFlair(),
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
                  clipBehavior: Clip.antiAlias,
                  child: Image.asset(isDo ? 'assets/upload-wardrobe-do.png' : 'assets/upload-wardrobe-dont.png', fit: BoxFit.cover),
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
                            Image.asset(isDo ? 'assets/check-circle.png' : 'assets/x-circle.png', width: 20, height: 20),
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
