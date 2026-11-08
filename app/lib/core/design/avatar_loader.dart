import 'dart:ui' show ImageFilter;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../features/onboarding/avatar_job_state.dart';
import '../../features/onboarding/profile_state.dart';
import 'stage_carousel.dart';

/// Four user-facing stages; several backend phases share one.
const List<String> _stages = ['Adjusting body proportion', 'Identifying facial features', 'Finalizing', 'Wrapping up'];

int _stageFor(String phase) => switch (phase) {
      'faceswap' => 1,
      'rembg' => 2,
      'finalize' || 'model3d' || 'done' => 3,
      _ => 0,
    };

/// The avatar slot on the membership-card page: mannequin when there's no
/// job, blurred mannequin with rolling stage labels while it runs, and the
/// generated avatar (or mannequin on error) with a Retake pill after.
class AvatarLoader extends ConsumerWidget {
  const AvatarLoader({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final job = ref.watch(avatarJobStateProvider);
    final face = ref.watch(facePhotoProvider);
    final state = job.valueOrNull;
    const mannequin = Image(image: AssetImage('assets/mannequin.png'), fit: BoxFit.contain);
    // Retake re-captures the photo; the membership page restarts the job when it changes.
    final retake = face == null ? null : _RetakePill(onTap: () => context.push('/onboarding/capture-face'));

    Widget slot(List<Widget> children) => ConstrainedBox(
          constraints: const BoxConstraints(maxHeight: 375),
          child: Stack(alignment: Alignment.center, children: children),
        );

    if (state?.isDone ?? false) {
      final url = state!.resultUrl;
      return slot([
        Positioned.fill(child: url == null ? mannequin : Image.network(url, fit: BoxFit.contain, errorBuilder: (_, __, ___) => mannequin)),
        if (retake != null) retake,
      ]);
    }
    if (job.hasError || (state?.isError ?? false)) {
      return slot([const Positioned.fill(child: mannequin), if (retake != null) retake]);
    }
    if (!job.isLoading && state?.sessionId == null) {
      return slot([const Positioned.fill(child: mannequin)]);
    }
    final active = _stageFor(state?.phase ?? 'classify');
    return slot([
      const Positioned.fill(child: mannequin),
      Positioned.fill(
        child: ClipRect(
          child: BackdropFilter(filter: ImageFilter.blur(sigmaX: 12, sigmaY: 12), child: const ColoredBox(color: Color(0x1AFFFFFF))),
        ),
      ),
      StageCarousel(stages: _stages, active: active, visibleRows: 4),
    ]);
  }
}

class _RetakePill extends StatelessWidget {
  const _RetakePill({required this.onTap});

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      key: const ValueKey('avatar_retake'),
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.fromLTRB(4, 8, 16, 8),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(999),
          boxShadow: const [BoxShadow(color: Color(0x1F000000), offset: Offset(0, 1), blurRadius: 4)],
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Image.asset('assets/reset.png', width: 24, height: 24),
            const SizedBox(width: 6),
            const Text('Retake', style: TextStyle(fontSize: 14, height: 18 / 14, color: Colors.black)),
          ],
        ),
      ),
    );
  }
}
