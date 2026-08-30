import 'dart:io';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_typography.dart';

/// Steal-the-look failure state: reason-specific copy (multiple_people vs a
/// generic error) over the offending photo, with a retry that returns to the
/// guide so the user can pick another picture.
class StealTheLookFailedScreen extends StatelessWidget {
  const StealTheLookFailedScreen({super.key, this.reason, this.uri});

  final String? reason;
  final String? uri;

  @override
  Widget build(BuildContext context) {
    final isMultiple = reason == 'multiple_people';
    final title = isMultiple
        ? "Can't proceed with the outfit breakdown"
        : 'Could not process this photo';
    final body = isMultiple
        ? "We noticed your image shows multiple people. We can only analyze "
            "one person's outfit at a time. Please upload a photo with a "
            "single person and try again."
        : 'Something went wrong while analyzing your inspiration. Please '
            'try again with a different photo.';

    return Scaffold(
      backgroundColor: AppColors.page,
      body: SafeArea(
        child: Column(
          children: [
            Expanded(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(20, 24, 20, 24),
                child: Column(
                  children: [
                    Expanded(child: _PhotoFrame(uri: uri)),
                    const SizedBox(height: 32),
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 12),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              const Icon(Icons.warning_amber_rounded,
                                  color: AppColors.accent, size: 24),
                              const SizedBox(width: 8),
                              Expanded(
                                child: Text(
                                  title,
                                  style: const TextStyle(
                                    fontFamily: 'FunnelSans',
                                    fontSize: 16,
                                    height: 22 / 16,
                                    letterSpacing: -0.16,
                                    fontWeight: FontWeight.w700,
                                    color: AppColors.accent,
                                  ),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 12),
                          Text(
                            body,
                            style: const TextStyle(
                              fontFamily: 'FunnelSans',
                              fontSize: 14,
                              height: 18 / 14,
                              color: AppColors.textPrimary,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
              child: SizedBox(
                height: 56,
                child: ElevatedButton.icon(
                  key: const ValueKey('stl_retry'),
                  onPressed: () => context.go('/steal-the-look'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.dark,
                    foregroundColor: Colors.white,
                    elevation: 0,
                    shape: const StadiumBorder(),
                  ),
                  icon: const Icon(Icons.add_photo_alternate_outlined, size: 20),
                  label: const Text('Upload another picture',
                      style: AppTypography.buttonLabel),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// The offending photo in a white frame with a red glow (fallback: canvas).
class _PhotoFrame extends StatelessWidget {
  const _PhotoFrame({this.uri});

  final String? uri;

  @override
  Widget build(BuildContext context) {
    final file = _fileFor(uri);
    return Container(
      width: double.infinity,
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(4),
        boxShadow: const [
          BoxShadow(
            color: Color(0x40FC0000),
            blurRadius: 50,
            offset: Offset.zero,
          ),
        ],
      ),
      padding: const EdgeInsets.all(8),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(2),
        child: file == null
            ? const ColoredBox(color: AppColors.chip)
            : Image.file(
                file,
                fit: BoxFit.cover,
                errorBuilder: (_, __, ___) =>
                    const ColoredBox(color: AppColors.chip),
              ),
      ),
    );
  }

  static File? _fileFor(String? rawUri) {
    if (rawUri == null || rawUri.isEmpty) return null;
    final uri = Uri.tryParse(rawUri);
    if (uri != null && uri.isAbsolute && uri.scheme == 'file') {
      return File.fromUri(uri);
    }
    return File(rawUri);
  }
}