import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../features/onboarding/avatar_job_state.dart';
import '../theme/app_colors.dart';

/// Renders the avatar-normalize job phases with a progress state.
/// Used by the membership-card screen: spinner + phase label while the job
/// runs, the generated avatar once done, an error state on failure.
class AvatarLoader extends ConsumerWidget {
  const AvatarLoader({super.key, this.size = 120, this.showImage = true});

  final double size;
  final bool showImage;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final job = ref.watch(avatarJobStateProvider);
    return job.when(
      loading: () => _StatusBox(size: size, loading: true, label: 'Creating your avatar…'),
      error: (_, __) => _StatusBox(size: size, label: 'Avatar failed'),
      data: (state) {
        if (state.isDone) {
          final url = state.resultUrl;
          if (showImage && url != null) {
            return ClipOval(
              child: Image.network(
                url,
                width: size,
                height: size,
                fit: BoxFit.cover,
                errorBuilder: (_, __, ___) => _StatusBox(size: size, label: 'Avatar ready'),
              ),
            );
          }
          return _StatusBox(size: size, label: 'Avatar ready');
        }
        if (state.isError) {
          return _StatusBox(size: size, label: state.error ?? 'Avatar failed');
        }
        return _StatusBox(size: size, label: 'Waiting for photo…');
      },
    );
  }
}

class _StatusBox extends StatelessWidget {
  const _StatusBox({required this.size, this.loading = false, required this.label});

  final double size;
  final bool loading;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: const BoxDecoration(
        color: AppColors.chip,
        shape: BoxShape.circle,
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          if (loading) ...[
            const SizedBox(
              width: 24,
              height: 24,
              child: CircularProgressIndicator(strokeWidth: 3, color: AppColors.dark),
            ),
            const SizedBox(height: 10),
          ],
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12),
            child: Text(
              label,
              textAlign: TextAlign.center,
              maxLines: 2,
              style: const TextStyle(
                fontFamily: 'FunnelSans',
                fontSize: 12,
                color: AppColors.textSecondary,
              ),
            ),
          ),
        ],
      ),
    );
  }
}