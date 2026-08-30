import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api/api_providers.dart';
import '../../core/api/endpoints.dart';
import '../../core/auth/auth_state.dart';
import '../../core/theme/app_colors.dart';

/// GET /api/biometrics → { defaultAvatarUrl }. Used as a hero fallback when
/// neither a saved outfit nor a steal-the-look draft matches.
final biometricsProvider =
    AsyncNotifierProvider<BiometricsNotifier, Map<String, dynamic>?>(
        BiometricsNotifier.new);

class BiometricsNotifier extends AsyncNotifier<Map<String, dynamic>?> {
  @override
  Future<Map<String, dynamic>?> build() async {
    ref.watch(authStateProvider);
    final api = ref.watch(apiClientProvider);
    final body = await api.get(ApiEndpoints.biometrics);
    return body is Map ? Map<String, dynamic>.from(body) : null;
  }
}

/// Maps a try-on slot category to the saved-outfit column it populates.
String slotKeyForCategory(String category) {
  switch (category) {
    case 'headwear':
      return 'headwearId';
    case 'shirt':
      return 'baseId';
    case 'jacket':
      return 'outerId';
    case 'pants':
      return 'bottomId';
    case 'footwear':
      return 'footwearId';
  }
  return 'headwearId';
}

/// Finds the first saved outfit whose filled slots all match the current
/// selection. Wardrobe slots must match the outfit's slot id; AI/upload slots
/// match only when the outfit left that slot empty.
Map<String, dynamic>? matchSavedOutfit(
  Map<String, dynamic> slots,
  List<dynamic> outfits,
) {
  final filled = <MapEntry<String, Map<String, dynamic>>>[
    for (final entry in slots.entries)
      if (entry.value is Map)
        MapEntry(entry.key, Map<String, dynamic>.from(entry.value as Map)),
  ];
  if (filled.isEmpty) return null;
  for (final raw in outfits) {
    if (raw is! Map) continue;
    final outfit = Map<String, dynamic>.from(raw);
    var allMatch = true;
    for (final entry in filled) {
      final outfitValue = outfit[slotKeyForCategory(entry.key)];
      final kind = entry.value['kind'];
      if (kind == 'wardrobe') {
        if (outfitValue != entry.value['itemId']) {
          allMatch = false;
          break;
        }
      } else if (outfitValue != null) {
        allMatch = false;
        break;
      }
    }
    if (allMatch) return outfit;
  }
  return null;
}

String? matchSavedOutfitHero(List<dynamic> outfits, Map<String, dynamic> slots) =>
    matchSavedOutfit(slots, outfits)?['heroImageUrl'] as String?;

String? draftHeroUrl(Map<String, dynamic>? draft) =>
    draft?['heroImageUrl'] as String?;

/// Resolves the hero image for the try-on floor via the fallback chain:
/// matched saved outfit hero → draft hero → default avatar → null (mannequin).
String? resolveHeroImageUrl({
  required List<dynamic> outfits,
  required Map<String, dynamic> slots,
  required Map<String, dynamic>? draft,
  required Map<String, dynamic>? biometrics,
}) {
  return matchSavedOutfitHero(outfits, slots) ??
      draftHeroUrl(draft) ??
      (biometrics?['defaultAvatarUrl'] as String?);
}

/// The full-body hero image with a floor shadow. Falls back to the mannequin
/// asset when no hero url resolved.
class HeroFloor extends StatelessWidget {
  const HeroFloor({super.key, required this.imageUrl});

  static const double aspectRatio = 832 / 1248;

  final String? imageUrl;

  @override
  Widget build(BuildContext context) {
    return AspectRatio(
      aspectRatio: aspectRatio,
      child: Stack(
        fit: StackFit.expand,
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(20),
            child: imageUrl == null
                ? Image.asset(
                    'assets/mannequin.png',
                    fit: BoxFit.contain,
                  )
                : Image.network(
                    imageUrl!,
                    fit: BoxFit.cover,
                    loadingBuilder: (context, child, progress) =>
                        progress == null
                            ? child
                            : const ColoredBox(color: AppColors.page),
                    errorBuilder: (context, error, stackTrace) => Image.asset(
                      'assets/mannequin.png',
                      fit: BoxFit.contain,
                    ),
                  ),
          ),
          const IgnorePointer(child: _FloorShadow()),
        ],
      ),
    );
  }
}

/// Soft vignette plus an ellipse shadow that grounds the figure on a floor.
class _FloorShadow extends StatelessWidget {
  const _FloorShadow();

  @override
  Widget build(BuildContext context) {
    return Stack(
      fit: StackFit.expand,
      children: [
        const DecoratedBox(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [
                Colors.transparent,
                Colors.transparent,
                Color(0x66000000),
              ],
              stops: [0.62, 0.84, 1.0],
            ),
          ),
        ),
        Align(
          alignment: Alignment.bottomCenter,
          child: Container(
            margin: const EdgeInsets.only(bottom: 10),
            width: 150,
            height: 18,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(9),
              gradient: const RadialGradient(
                colors: [
                  Color(0x99000000),
                  Color(0x00000000),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }
}