import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api/api_providers.dart';
import '../../core/api/endpoints.dart';
import '../../core/auth/auth_state.dart';

/// GET /api/biometrics: holds `defaultAvatarUrl`, the hero fallback.
final biometricsProvider =
    AsyncNotifierProvider<BiometricsNotifier, Map<String, dynamic>?>(BiometricsNotifier.new);

class BiometricsNotifier extends AsyncNotifier<Map<String, dynamic>?> {
  @override
  Future<Map<String, dynamic>?> build() async {
    ref.watch(authStateProvider);
    final body = await ref.watch(apiClientProvider).get(ApiEndpoints.biometrics);
    return body is Map ? Map<String, dynamic>.from(body) : null;
  }
}

/// Try-on slot category to the saved-outfit column it populates.
String slotKeyForCategory(String category) => switch (category) {
      'shirt' => 'baseId',
      'jacket' => 'outerId',
      'pants' => 'bottomId',
      'footwear' => 'footwearId',
      _ => 'headwearId',
    };

/// The hero figure standing on a soft floor glow. With [topOffset] the
/// figure is top-aligned that far below the parent's top; otherwise it sits
/// at the bottom. The mannequin with a spinner shows while a remote image is loading.
class HeroFloor extends StatelessWidget {
  const HeroFloor({super.key, required this.imageUrl, this.topOffset, this.maxHeight, this.loading = false});

  /// Fixed canvas of the dress-avatar pipeline.
  static const double aspectRatio = 832 / 1248;

  final String? imageUrl;
  final double? topOffset;
  final double? maxHeight;

  /// The image URL itself is still being resolved; shows the spinner over
  /// the mannequin until [imageUrl] arrives.
  final bool loading;

  @override
  Widget build(BuildContext context) {
    const mannequin = Image(image: AssetImage('assets/mannequin.png'), fit: BoxFit.contain);
    const pending = Stack(
      alignment: Alignment.center,
      children: [
        Positioned.fill(child: mannequin),
        SizedBox(width: 28, height: 28, child: CircularProgressIndicator(strokeWidth: 2.5, color: Colors.black)),
      ],
    );
    return LayoutBuilder(
      builder: (context, c) {
        final height = maxHeight == null ? c.maxHeight : c.maxHeight.clamp(0.0, maxHeight!);
        final avail = topOffset == null ? height : (c.maxHeight - topOffset!).clamp(0.0, height);
        final width = avail * aspectRatio;
        final figureTop = topOffset ?? c.maxHeight - avail;
        Widget figure(Widget child) => SizedBox(width: width, height: avail, child: child);
        final url = imageUrl;
        return Stack(
          clipBehavior: Clip.none,
          children: [
            Positioned(
              top: figureTop + avail - width * 0.6,
              left: c.maxWidth / 2 - width + 18,
              width: width * 2,
              height: width,
              child: Opacity(opacity: 0.8, child: Image.asset('assets/ellipse.png', fit: BoxFit.fill)),
            ),
            Positioned(
              top: figureTop,
              left: (c.maxWidth - width) / 2,
              child: figure(
                url == null
                    ? (loading ? pending : mannequin)
                    : Image.network(
                        url,
                        fit: BoxFit.contain,
                        frameBuilder: (context, child, frame, sync) => sync || frame != null ? child : pending,
                        errorBuilder: (_, __, ___) => mannequin,
                      ),
              ),
            ),
          ],
        );
      },
    );
  }
}
