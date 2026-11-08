import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import '../../core/design/photo_source.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_typography.dart';

/// Steal-the-look guide: DO/DON'T cards explaining what makes a good
/// inspiration photo, plus the upload CTA that picks an image (camera or
/// library) and pushes the analyzing screen with the file uri.
class StealTheLookScreen extends ConsumerStatefulWidget {
  const StealTheLookScreen({super.key});

  @override
  ConsumerState<StealTheLookScreen> createState() => _StealTheLookScreenState();
}

class _StealTheLookScreenState extends ConsumerState<StealTheLookScreen> {
  Future<void> _upload() async {
    final source = await pickPhotoSource(context);
    if (source == null || !mounted) return;

    XFile? image;
    try {
      image = await ImagePicker().pickImage(
        source: source,
        maxWidth: 1600,
        imageQuality: 90,
      );
    } catch (_) {
      image = null;
    }
    if (image == null || !mounted) return;
    context.push(
      '/steal-the-look/analyzing?uri=${Uri.encodeQueryComponent(image.path)}',
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.page,
      body: Stack(
        children: [
          SafeArea(
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(20, 24, 20, 140),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const _Title(),
                  const SizedBox(height: 4),
                  Text(
                    'Upload an outfit inspiration',
                    style:
                        AppTypography.body.copyWith(color: AppColors.textPrimary),
                  ),
                  const SizedBox(height: 32),
                  const _GuideCard(
                    kind: 'do',
                    title: 'DO',
                    body: 'Have 1 (one) person in\nthe frame.',
                    caption:
                        'Even if the background is busy, we can analyze it without problem.',
                  ),
                  const SizedBox(height: 17),
                  const _GuideCard(
                    kind: 'dont',
                    title: "DON'T",
                    body: 'Have multiple people\nin the frame.',
                    caption: 'Which one do you even want?',
                  ),
                ],
              ),
            ),
          ),
          Positioned(
            top: MediaQuery.paddingOf(context).top + 12,
            right: 20,
            child: IconButton(
              key: const ValueKey('stl_close'),
              onPressed: () => context.pop(),
              icon: Image.asset('assets/x.png', width: 24, height: 24, color: Colors.black),
            ),
          ),
          Positioned(
            left: 20,
            right: 20,
            bottom: MediaQuery.paddingOf(context).bottom + 16,
            child: SizedBox(
              height: 56,
              child: ElevatedButton.icon(
                key: const ValueKey('stl_upload'),
                onPressed: _upload,
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.dark,
                  foregroundColor: Colors.white,
                  elevation: 0,
                  shape: const StadiumBorder(),
                ),
                icon: Image.asset('assets/picture.png', width: 24, height: 20, color: Colors.white),
                label: const Text('Upload a picture',
                    style: AppTypography.buttonLabel),
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
          TextSpan(text: 'STE'),
          TextSpan(text: 'A', style: kirang),
          TextSpan(text: 'L T'),
          TextSpan(text: 'H', style: kirang),
          TextSpan(text: 'E '),
          TextSpan(text: 'L', style: kirang),
          TextSpan(text: 'OOK'),
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
    final accent = isDo ? AppColors.doGreen : const Color(0xFFE90000);
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
                  clipBehavior: Clip.antiAlias,
                  child: Image.asset(isDo ? 'assets/stealthelook-do.png' : 'assets/stealthelook-dont.png', fit: BoxFit.cover),
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