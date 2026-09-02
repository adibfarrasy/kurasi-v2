import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/api/api_providers.dart';
import '../../core/api/endpoints.dart';
import '../../core/api/wardrobe_items_provider.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_typography.dart';
import '../myfit/outfits_provider.dart';
import '../wardrobe/wardrobe_ui_provider.dart';
import 'slot_strip.dart';
import 'steal_the_look_draft.dart';

Map<String, dynamic>? _aiItemForSlot(Map<String, dynamic> slot) {
  if (slot['kind'] == 'ai') {
    final ai = slot['aiItem'];
    return ai is Map ? Map<String, dynamic>.from(ai) : null;
  }
  return null;
}

/// Builds the `slots` array for POST /api/outfits/from-tryon in fixed
/// category order. Wardrobe slots become `{category, wardrobeId}`; AI slots
/// become `{category, aiItem}`.
List<Map<String, dynamic>> buildTryOnSlots(Map<String, dynamic> slots) {
  final result = <Map<String, dynamic>>[];
  for (final category in wardrobeCategories) {
    final slot = slotForCategory(slots, category);
    if (slot == null) continue;
    if (slot['kind'] == 'wardrobe') {
      result.add({'category': category, 'wardrobeId': slot['itemId']});
    } else {
      final aiItem = _aiItemForSlot(slot);
      if (aiItem != null) {
        result.add({'category': category, 'aiItem': aiItem});
      }
    }
  }
  return result;
}

class SaveFitSheet extends ConsumerStatefulWidget {
  const SaveFitSheet({super.key, required this.heroImageUrl});

  final String? heroImageUrl;

  static Future<void> show(BuildContext context, {String? heroImageUrl}) {
    return showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => SaveFitSheet(heroImageUrl: heroImageUrl),
    );
  }

  @override
  ConsumerState<SaveFitSheet> createState() => _SaveFitSheetState();
}

class _SaveFitSheetState extends ConsumerState<SaveFitSheet> {
  final _nameController = TextEditingController();
  bool _saving = false;
  String? _error;

  @override
  void dispose() {
    _nameController.dispose();
    super.dispose();
  }

  Future<void> _onConfirm() async {
    final name = _nameController.text.trim();
    if (name.isEmpty) {
      setState(() => _error = 'Give your fit a name');
      return;
    }
    final slots = buildTryOnSlots(ref.read(tryOnSlotsProvider));
    if (slots.isEmpty) {
      setState(() => _error = 'Pick at least one item to save');
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    final navigator = Navigator.of(context);
    final router = GoRouter.of(context);
    try {
      await ref.read(apiClientProvider).post(
            ApiEndpoints.outfitsFromTryon,
            body: {
              'name': name,
              'heroImageUrl': widget.heroImageUrl,
              'slots': slots,
            },
          );
      ref.invalidate(outfitsProvider);
      ref.invalidate(wardrobeItemsProvider);
      ref.read(tryOnSlotsProvider.notifier).reset();
      await persistStealTheLookDraft(ref, null);
      if (!mounted) return;
      navigator.pop();
      router.go('/myfit');
    } catch (err) {
      if (!mounted) return;
      setState(() {
        _saving = false;
        _error = 'Failed to save fit';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final filledCount = ref
        .watch(tryOnSlotsProvider)
        .values
        .whereType<Map>()
        .length;
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 20, 20, 0),
        child: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      'Save Fit',
                      style: AppTypography.body
                          .copyWith(fontWeight: FontWeight.w700),
                    ),
                  ),
                  InkWell(
                    onTap: () => Navigator.of(context).pop(),
                    customBorder: const CircleBorder(),
                    child: const Padding(
                      padding: EdgeInsets.all(4),
                      child: Icon(Icons.close,
                          color: AppColors.textPrimary, size: 24),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              TextField(
                key: const ValueKey('save_fit_name'),
                controller: _nameController,
                decoration: InputDecoration(
                  hintText: 'Fit name',
                  filled: true,
                  fillColor: AppColors.chip,
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: BorderSide.none,
                  ),
                ),
              ),
              if (_error != null) ...[
                const SizedBox(height: 8),
                Text(
                  _error!,
                  style: AppTypography.caption.copyWith(color: AppColors.dontRed),
                ),
              ],
              const SizedBox(height: 16),
              Text(
                '$filledCount of 5 pieces',
                style: AppTypography.caption.copyWith(color: AppColors.textMuted),
              ),
              const SizedBox(height: 20),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  key: const ValueKey('save_fit_confirm'),
                  onPressed: _saving ? null : _onConfirm,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.accent,
                    foregroundColor: Colors.white,
                    disabledBackgroundColor: AppColors.disabled,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                  child: _saving
                      ? const SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Colors.white,
                          ),
                        )
                      : const Text('Save Fit', style: AppTypography.buttonLabel),
                ),
              ),
              const SizedBox(height: 20),
            ],
          ),
        ),
      ),
    );
  }
}