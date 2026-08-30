import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/api/endpoints.dart';
import '../../core/api/api_providers.dart';
import '../../core/design/wheel_picker.dart';
import '../../core/theme/app_colors.dart';
import 'profile_state.dart';

const List<String> _genders = ['Male', 'Female'];
final List<int> _heights = List.generate(220 - 140 + 1, (i) => 140 + i);
final List<int> _weights = List.generate(150 - 40 + 1, (i) => 40 + i);

/// Onboarding screen 3 — pick gender / height / weight and add a face photo.
/// Port of RN `onboarding-3.tsx`: mannequin hero with "Add Face" pill,
/// three [WheelPicker]s bound to the profile state providers, and a Continue
/// button that persists biometrics (best-effort) then navigates to
/// capture-face (no face yet) or membership-card.
class OnboardingThreeScreen extends ConsumerWidget {
  const OnboardingThreeScreen({super.key});

  Future<void> _onContinue(WidgetRef ref, BuildContext context) async {
    final height = ref.read(heightProvider);
    final weight = ref.read(weightProvider);
    final faceUri = ref.read(facePhotoProvider);
    try {
      await ref.read(apiClientProvider).post(
            ApiEndpoints.biometrics,
            body: {'heightCm': height, 'weightKg': weight, 'facePhotoUrl': faceUri},
          );
    } catch (err) {
      debugPrint('[onboarding-3] biometrics.set failed: $err');
    }
    if (!context.mounted) return;
    if (faceUri == null) {
      context.go('/onboarding/capture-face');
    } else {
      context.go('/onboarding/membership-card');
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final gender = ref.watch(genderProvider);
    final height = ref.watch(heightProvider);
    final weight = ref.watch(weightProvider);
    final faceUri = ref.watch(facePhotoProvider);

    return Scaffold(
      backgroundColor: AppColors.onboardPage,
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Expanded(
              child: Stack(
                fit: StackFit.expand,
                children: [
                  Padding(
                    padding: const EdgeInsets.only(top: 60),
                    child: Image.asset('assets/mannequin.png', fit: BoxFit.contain),
                  ),
                  Align(
                    alignment: Alignment.topCenter,
                    child: Padding(
                      padding: const EdgeInsets.only(top: 30),
                      child: _AddFacePill(
                        hasFace: faceUri != null,
                        onTap: () => context.push('/onboarding/capture-face'),
                      ),
                    ),
                  ),
                ],
              ),
            ),
            _BottomPanel(
              gender: gender,
              height: height,
              weight: weight,
              onGenderChanged: (v) => ref.read(genderProvider.notifier).state = v,
              onHeightChanged: (v) => ref.read(heightProvider.notifier).state = v,
              onWeightChanged: (v) => ref.read(weightProvider.notifier).state = v,
              onContinue: () => _onContinue(ref, context),
            ),
          ],
        ),
      ),
    );
  }
}

class _AddFacePill extends StatelessWidget {
  const _AddFacePill({required this.hasFace, required this.onTap});

  final bool hasFace;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(999),
      elevation: 1,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(999),
        child: Padding(
          padding: EdgeInsets.symmetric(horizontal: hasFace ? 16 : 12, vertical: 8),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (!hasFace) ...[
                Image.asset('assets/smiley-face.png', width: 18, height: 18),
                const SizedBox(width: 8),
              ],
              Text(
                hasFace ? 'Change' : 'Add Face',
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
      ),
    );
  }
}

class _BottomPanel extends StatelessWidget {
  const _BottomPanel({
    required this.gender,
    required this.height,
    required this.weight,
    required this.onGenderChanged,
    required this.onHeightChanged,
    required this.onWeightChanged,
    required this.onContinue,
  });

  final String gender;
  final int height;
  final int weight;
  final ValueChanged<String> onGenderChanged;
  final ValueChanged<int> onHeightChanged;
  final ValueChanged<int> onWeightChanged;
  final VoidCallback onContinue;

  @override
  Widget build(BuildContext context) {
    return Container(
      color: Colors.white,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const _TopFlair(),
          const Padding(
            padding: EdgeInsets.symmetric(horizontal: 24, vertical: 20),
            child: Text(
              'Design an avatar that looks just like you.',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontFamily: 'FunnelSans',
                fontSize: 16,
                height: 22 / 16,
                letterSpacing: -0.16,
                color: AppColors.textSecondary,
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 24),
            child: Column(
              children: [
                const Row(
                  children: [
                    Expanded(child: _ColumnLabel('Gender')),
                    Expanded(child: _ColumnLabel('Height (cm)')),
                    Expanded(child: _ColumnLabel('Weight (kg)')),
                  ],
                ),
                SizedBox(
                  height: wheelItemHeight * wheelVisibleCount,
                  child: Stack(
                    children: [
                      const Positioned(
                        top: wheelItemHeight * (wheelVisibleCount ~/ 2),
                        left: -24,
                        right: -24,
                        height: wheelItemHeight,
                        child: ColoredBox(color: Color(0xFFF5F5F5)),
                      ),
                      Row(
                        children: [
                          Expanded(
                            child: WheelPicker<String>(
                              items: _genders,
                              itemBuilder: (v) => _WheelLabel(v),
                              initialValue: gender,
                              onChanged: onGenderChanged,
                            ),
                          ),
                          Expanded(
                            child: WheelPicker<int>(
                              items: _heights,
                              itemBuilder: (v) => _WheelLabel(v.toString()),
                              initialValue: height,
                              onChanged: onHeightChanged,
                            ),
                          ),
                          Expanded(
                            child: WheelPicker<int>(
                              items: _weights,
                              itemBuilder: (v) => _WheelLabel(v.toString()),
                              initialValue: weight,
                              onChanged: onWeightChanged,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 30, vertical: 40),
            child: SafeArea(
              top: false,
              child: SizedBox(
                height: 56,
                child: ElevatedButton(
                  onPressed: onContinue,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.dark,
                    foregroundColor: Colors.white,
                    elevation: 0,
                    shape: const StadiumBorder(),
                    textStyle: const TextStyle(
                      fontFamily: 'FunnelSans',
                      fontSize: 16,
                      fontWeight: FontWeight.w500,
                      letterSpacing: -0.24,
                    ),
                  ),
                  child: const Text('Continue'),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _WheelLabel extends StatelessWidget {
  const _WheelLabel([this.text]);

  final String? text;

  @override
  Widget build(BuildContext context) {
    return Text(
      text ?? '',
      style: const TextStyle(
        fontFamily: 'FunnelSans',
        fontSize: 16,
        height: 22 / 16,
        letterSpacing: -0.16,
        color: AppColors.textPrimary,
      ),
    );
  }
}

class _ColumnLabel extends StatelessWidget {
  const _ColumnLabel(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    return Text(
      text,
      textAlign: TextAlign.center,
      style: const TextStyle(
        fontFamily: 'FunnelSans',
        fontSize: 16,
        fontWeight: FontWeight.bold,
        color: AppColors.textPrimary,
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
          Expanded(child: Image.asset('assets/top-flair.png', height: 12, fit: BoxFit.fill)),
          const SizedBox(width: 6),
          Expanded(child: Image.asset('assets/top-flair.png', height: 12, fit: BoxFit.fill)),
        ],
      ),
    );
  }
}