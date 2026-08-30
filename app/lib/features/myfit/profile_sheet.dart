import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/auth/auth_state.dart';
import '../../core/design/membership_card_view.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_typography.dart';
import '../credits/credits_provider.dart';
import '../onboarding/membership_state.dart';
import '../onboarding/profile_state.dart';
import '../onboarding/signature_state.dart';

class ProfileSheet extends ConsumerWidget {
  const ProfileSheet({super.key});

  static Future<void> show(BuildContext context) {
    return showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => const ProfileSheet(),
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final balance = ref.watch(creditsProvider).value?['balance'] as int? ?? 0;
    final name = ref.watch(cardNameProvider);
    final signatures = ref.watch(signaturePathsProvider);

    return Container(
      height: MediaQuery.sizeOf(context).height,
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      child: SafeArea(
        top: false,
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Align(
                alignment: Alignment.centerRight,
                child: IconButton(
                  key: const ValueKey('profile_sheet_close'),
                  onPressed: () => Navigator.of(context).pop(),
                  icon: const Icon(Icons.close, color: AppColors.textPrimary, size: 24),
                ),
              ),
              const SizedBox(height: 8),
              MembershipCardView(name: name, signaturePaths: signatures),
              const SizedBox(height: 24),
              _ProfileRow(
                title: 'AI Balance',
                trailing: Text(
                  '$balance',
                  style: AppTypography.buttonLabel.copyWith(color: AppColors.textPrimary),
                ),
                onTap: () => _goTo(context, '/ai-balance'),
              ),
              const Divider(height: 1, color: AppColors.page),
              _ProfileRow(
                title: 'Update Data',
                onTap: () => _showUpdateDataSheet(context),
              ),
              const Divider(height: 1, color: AppColors.page),
              _ProfileRow(
                title: 'Subscription Plan',
                onTap: () => _goTo(context, '/subscription'),
              ),
              const Divider(height: 1, color: AppColors.page),
              _ProfileRow(
                title: 'Log Out',
                titleColor: AppColors.dontRed,
                onTap: () => ref.read(authStateProvider.notifier).signOut(),
              ),
            ],
          ),
        ),
      ),
    );
  }

  static void _goTo(BuildContext context, String location) {
    Navigator.of(context).pop();
    context.push(location);
  }

  static void _showUpdateDataSheet(BuildContext context) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => const _UpdateDataSheet(),
    );
  }
}

class _ProfileRow extends StatelessWidget {
  const _ProfileRow({required this.title, this.trailing, required this.onTap, this.titleColor});

  final String title;
  final Widget? trailing;
  final VoidCallback onTap;
  final Color? titleColor;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 16),
        child: Row(
          children: [
            Expanded(
              child: Text(
                title,
                style: AppTypography.body.copyWith(color: titleColor ?? AppColors.textPrimary),
              ),
            ),
            if (trailing != null) ...[
              trailing!,
              const SizedBox(width: 8),
            ],
            const Icon(Icons.chevron_right, color: AppColors.textSecondary),
          ],
        ),
      ),
    );
  }
}

class _UpdateDataSheet extends ConsumerStatefulWidget {
  const _UpdateDataSheet();

  @override
  ConsumerState<_UpdateDataSheet> createState() => _UpdateDataSheetState();
}

class _UpdateDataSheetState extends ConsumerState<_UpdateDataSheet> {
  late final TextEditingController _name;
  late final TextEditingController _height;
  late final TextEditingController _weight;

  @override
  void initState() {
    super.initState();
    _name = TextEditingController(text: ref.read(cardNameProvider));
    _height = TextEditingController(text: '${ref.read(heightProvider)}');
    _weight = TextEditingController(text: '${ref.read(weightProvider)}');
  }

  @override
  void dispose() {
    _name.dispose();
    _height.dispose();
    _weight.dispose();
    super.dispose();
  }

  void _save() {
    ref.read(cardNameProvider.notifier).state = _name.text.trim();
    final height = int.tryParse(_height.text.trim());
    final weight = int.tryParse(_weight.text.trim());
    if (height != null) ref.read(heightProvider.notifier).state = height;
    if (weight != null) ref.read(weightProvider.notifier).state = weight;
    Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    final bottomInset = MediaQuery.viewInsetsOf(context).bottom;
    return Padding(
      padding: EdgeInsets.only(bottom: bottomInset),
      child: Container(
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
        decoration: const BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
        ),
        child: SafeArea(
          top: false,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Align(
                alignment: Alignment.centerRight,
                child: IconButton(
                  onPressed: () => Navigator.of(context).pop(),
                  icon: const Icon(Icons.close, color: AppColors.textPrimary, size: 24),
                ),
              ),
              const Text('Update Data', style: AppTypography.buttonLabel),
              const SizedBox(height: 16),
              TextField(
                controller: _name,
                decoration: const InputDecoration(labelText: 'Name'),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _height,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(labelText: 'Height (cm)'),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _weight,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(labelText: 'Weight (kg)'),
              ),
              const SizedBox(height: 24),
              FilledButton(
                style: FilledButton.styleFrom(
                  backgroundColor: AppColors.dark,
                  padding: const EdgeInsets.symmetric(vertical: 14),
                ),
                onPressed: _save,
                child: const Text('Save', style: AppTypography.buttonLabel),
              ),
            ],
          ),
        ),
      ),
    );
  }
}