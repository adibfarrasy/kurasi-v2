import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/design/avatar_loader.dart';
import '../../core/design/membership_card_view.dart';
import '../../core/design/signature_pad.dart';
import '../../core/theme/app_colors.dart';
import 'avatar_job_state.dart';
import 'membership_state.dart';
import 'profile_state.dart';
import 'signature_state.dart';

/// Onboarding terminal step 1 — membership card. Auto-starts the avatar job
/// when the captured face changes (effect on [facePhotoProvider]), renders
/// the generated avatar while it runs, then opens a 2-step sheet:
/// name → signature → Done.
class MembershipCardScreen extends ConsumerStatefulWidget {
  const MembershipCardScreen({super.key});

  @override
  ConsumerState<MembershipCardScreen> createState() => _MembershipCardScreenState();
}

class _MembershipCardScreenState extends ConsumerState<MembershipCardScreen> {
  bool _sheetShown = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _kickoff());
  }

  void _kickoff() {
    final uri = ref.read(facePhotoProvider);
    final job = ref.read(avatarJobStateProvider).value;
    if (uri != null && job != null && job.phase == 'idle') {
      ref.read(avatarJobStateProvider.notifier).startAvatarJob(uri: uri);
    }
    if (job?.isDone ?? false) _maybeShowSheet();
  }

  void _retry() {
    final uri = ref.read(facePhotoProvider);
    if (uri != null) {
      ref.read(avatarJobStateProvider.notifier).startAvatarJob(uri: uri);
    }
  }

  void _maybeShowSheet() {
    if (_sheetShown || !mounted) return;
    _sheetShown = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _openSheet();
    });
  }

  Future<void> _openSheet() async {
    final done = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
      ),
      builder: (_) => const _CardEditorSheet(),
    );
    if (done == true && mounted) {
      context.go('/onboarding/ai-credits');
    }
  }

  @override
  Widget build(BuildContext context) {
    ref.listen(facePhotoProvider, (previous, next) {
      if (next != null && next != previous) {
        ref.read(avatarJobStateProvider.notifier).startAvatarJob(uri: next);
      }
    });
    ref.listen(avatarJobStateProvider, (previous, next) {
      if (next.value?.isDone ?? false) _maybeShowSheet();
    });

    final job = ref.watch(avatarJobStateProvider);
    final name = ref.watch(cardNameProvider);
    final signaturePaths = ref.watch(signaturePathsProvider);

    return Scaffold(
      backgroundColor: AppColors.onboardPage,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(24, 32, 24, 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text(
                'Create your membership card',
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontFamily: 'BebasNeue',
                  fontSize: 40,
                  height: 44 / 40,
                  color: AppColors.textPrimary,
                ),
              ),
              const SizedBox(height: 8),
              const Text(
                'Your name and signature make it yours.',
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontFamily: 'FunnelSans',
                  fontSize: 14,
                  height: 20 / 14,
                  color: AppColors.textSecondary,
                ),
              ),
              const Spacer(),
              Center(
                child: job.when(
                  loading: () => const AvatarLoader(size: 180),
                  error: (err, _) => _ErrorState(message: '$err', onRetry: _retry),
                  data: (state) {
                    if (state.isDone) {
                      return Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          const SizedBox(height: 12),
                          MembershipCardView(name: name, signaturePaths: signaturePaths),
                          const SizedBox(height: 20),
                          OutlinedButton.icon(
                            onPressed: _openSheet,
                            icon: const Icon(Icons.edit_outlined, size: 18),
                            label: const Text('Edit card'),
                            style: OutlinedButton.styleFrom(
                              foregroundColor: AppColors.textPrimary,
                              side: const BorderSide(color: AppColors.hairline),
                              padding: const EdgeInsets.symmetric(vertical: 14),
                              shape: const StadiumBorder(),
                            ),
                          ),
                        ],
                      );
                    }
                    return const AvatarLoader(size: 180);
                  },
                ),
              ),
              const Spacer(),
            ],
          ),
        ),
      ),
    );
  }
}

class _ErrorState extends StatelessWidget {
  const _ErrorState({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        const Text(
          'Avatar generation failed',
          style: TextStyle(fontFamily: 'FunnelSans', fontSize: 16, fontWeight: FontWeight.w600, color: AppColors.textPrimary),
        ),
        const SizedBox(height: 6),
        Text(
          message,
          textAlign: TextAlign.center,
          style: const TextStyle(fontFamily: 'FunnelSans', fontSize: 12, color: AppColors.textMuted),
        ),
        const SizedBox(height: 16),
        FilledButton(onPressed: onRetry, child: const Text('Try again')),
      ],
    );
  }
}

/// 2-step sheet: name input then signature pad. Step 2 pops with `true` to
/// signal the screen to continue to the AI-credits screen.
class _CardEditorSheet extends ConsumerStatefulWidget {
  const _CardEditorSheet();

  @override
  ConsumerState<_CardEditorSheet> createState() => _CardEditorSheetState();
}

class _CardEditorSheetState extends ConsumerState<_CardEditorSheet> {
  int _step = 0;

  void _next() => setState(() => _step = 1);

  void _done() => Navigator.of(context).pop(true);

  @override
  Widget build(BuildContext context) {
    final name = ref.watch(cardNameProvider);
    final canContinue = name.trim().isNotEmpty;
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(24, 12, 24, 24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Center(
                child: Container(
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(color: AppColors.hairline, borderRadius: BorderRadius.circular(2)),
                ),
              ),
              const SizedBox(height: 20),
              Text(
                _step == 0 ? 'What is your name?' : 'Sign your card',
                textAlign: TextAlign.center,
                style: const TextStyle(fontFamily: 'BebasNeue', fontSize: 32, height: 36 / 32, color: AppColors.textPrimary),
              ),
              const SizedBox(height: 6),
              Text(
                _step == 0 ? 'It appears on the front of your card.' : 'Draw your signature below.',
                textAlign: TextAlign.center,
                style: const TextStyle(fontFamily: 'FunnelSans', fontSize: 13, height: 18 / 13, color: AppColors.textSecondary),
              ),
              const SizedBox(height: 20),
              if (_step == 0)
                TextField(
                  autofocus: true,
                  textCapitalization: TextCapitalization.words,
                  onChanged: (value) => ref.read(cardNameProvider.notifier).state = value,
                  decoration: InputDecoration(
                    hintText: 'Your name',
                    filled: true,
                    fillColor: AppColors.chip,
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(14),
                      borderSide: BorderSide.none,
                    ),
                  ),
                )
              else
                SizedBox(
                  height: 220,
                  child: SignaturePad(
                    onChanged: (paths) => ref.read(signaturePathsProvider.notifier).state = paths,
                  ),
                ),
              const SizedBox(height: 24),
              SizedBox(
                height: 56,
                child: ElevatedButton(
                  onPressed: _step == 0 ? (canContinue ? _next : null) : _done,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.dark,
                    foregroundColor: Colors.white,
                    elevation: 0,
                    shape: const StadiumBorder(),
                    textStyle: const TextStyle(fontFamily: 'FunnelSans', fontSize: 16, fontWeight: FontWeight.w500, letterSpacing: -0.24),
                  ),
                  child: Text(_step == 0 ? 'Continue' : 'Done'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}