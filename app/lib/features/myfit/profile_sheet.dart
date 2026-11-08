import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../app/router.dart' show onboardingCompleteProvider;
import '../../core/auth/auth_state.dart';
import '../../core/design/flair_sheet.dart';
import '../../core/design/membership_card_view.dart';
import '../../core/design/wheel_picker.dart';
import '../credits/credits_provider.dart';
import '../onboarding/membership_state.dart';
import '../onboarding/avatar_job_state.dart';
import '../onboarding/profile_state.dart';
import '../onboarding/signature_state.dart';

const TextStyle _funnel = TextStyle(fontFamily: 'FunnelSans', color: Colors.black);
const Divider _divider = Divider(height: 1, thickness: 1, color: Color(0xFFE5E5E5));
const TextStyle _bebas36 = TextStyle(fontFamily: 'BebasNeue', fontSize: 36, height: 40 / 36, color: Colors.black);
const TextStyle _kirang44 = TextStyle(fontFamily: 'KirangHaerang', fontSize: 44, height: 40 / 44, color: Colors.black);

/// Transparent 220pt strip over the blurred page with the close button
/// sitting 11pt above the torn edge.
Widget _closeHeader(BuildContext sheetContext) => SizedBox(
      height: 220,
      child: Stack(
        children: [
          Positioned(
            top: 161,
            right: 20,
            child: GestureDetector(
              key: const ValueKey('sheet_close'),
              onTap: () => Navigator.of(sheetContext).pop(),
              child: Container(
                width: 48,
                height: 48,
                alignment: Alignment.center,
                decoration: const BoxDecoration(
                  color: Colors.white,
                  shape: BoxShape.circle,
                  boxShadow: [BoxShadow(color: Color(0x66000000), offset: Offset(0.5, 1), blurRadius: 1)],
                ),
                child: Image.asset('assets/x.png', width: 24, height: 24, color: Colors.black),
              ),
            ),
          ),
        ],
      ),
    );

/// Fills the rest of the screen below the header and torn edge. Reads the
/// view's insets because the sheet's MediaQuery has the top inset removed.
double _bodyHeight(BuildContext context) {
  final view = MediaQueryData.fromView(View.of(context));
  return view.size.height - view.padding.top - 232;
}

class ProfileSheet extends ConsumerWidget {
  const ProfileSheet({super.key});

  static Future<void> show(BuildContext context) {
    // Balance may have changed since the last open.
    ProviderScope.containerOf(context).invalidate(creditsProvider);
    return showFlairSheet<void>(context, divider: false, above: _closeHeader, builder: (_) => const ProfileSheet());
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final balance = (ref.watch(creditsProvider).valueOrNull?['balance'] as num?)?.toInt() ?? 0;
    final name = ref.watch(cardNameProvider);
    void go(String path) {
      final router = GoRouter.of(context);
      Navigator.of(context).pop();
      router.push(path);
    }

    Widget action(String icon, String label, {VoidCallback? onTap}) => GestureDetector(
          key: ValueKey('profile_$label'),
          behavior: HitTestBehavior.opaque,
          onTap: onTap,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 15),
            decoration: const BoxDecoration(border: Border(top: BorderSide(color: Color(0xFFE5E5E5)))),
            child: Row(
              children: [
                Image.asset(icon, width: 24, height: 24),
                const SizedBox(width: 16),
                Text(label, style: _funnel.copyWith(fontSize: 16, height: 22 / 16, letterSpacing: -0.16)),
              ],
            ),
          ),
        );

    return SizedBox(
      height: _bodyHeight(context),
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          ListView(
            padding: const EdgeInsets.only(bottom: 40),
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(24, 15, 24, 0),
                child: MembershipCardView(name: name),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(24, 15, 24, 20),
                child: Row(
                  children: [
                    Image.asset('assets/star.png', width: 24, height: 24),
                    const SizedBox(width: 12),
                    Expanded(child: Text('AI balance', style: _funnel.copyWith(fontSize: 16, height: 22 / 16, letterSpacing: -0.16))),
                    Text('$balance', style: _funnel.copyWith(fontSize: 20, height: 24 / 20, letterSpacing: -0.3, fontWeight: FontWeight.bold)),
                    const SizedBox(width: 12),
                    GestureDetector(
                      key: const ValueKey('profile_add_credits'),
                      onTap: () => go('/ai-balance'),
                      child: Container(
                        padding: const EdgeInsets.fromLTRB(12, 8, 16, 8),
                        decoration: BoxDecoration(color: Colors.black, borderRadius: BorderRadius.circular(999)),
                        child: Row(
                          children: [
                            const Text('＋', style: TextStyle(color: Colors.white, fontSize: 18, height: 1)),
                            const SizedBox(width: 6),
                            Text('Add', style: _funnel.copyWith(color: Colors.white, fontSize: 16, height: 22 / 16, letterSpacing: -0.16)),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              action('assets/user.png', 'Update Data', onTap: () => showUpdateDataSheet(context)),
              action('assets/signature.png', 'Edit Signature'),
              action('assets/book-open.png', 'Subscription Plan', onTap: () => go('/subscription')),
              action('assets/key.png', 'Change Password'),
              // Dev account only: re-enter onboarding without reinstalling.
              if (ref.watch(authStateProvider).valueOrNull?.email == 'adibfarrasy@gmail.com')
                action('assets/key.png', 'Reset onboarding (dev)', onTap: () {
                  final router = GoRouter.of(context);
                  Navigator.of(context).pop();
                  ref.read(onboardingCompleteProvider.notifier).set(false);
                  ref.read(avatarJobStateProvider.notifier).reset();
                  ref.read(facePhotoProvider.notifier).state = null;
                  ref.read(cardNameProvider.notifier).state = '';
                  ref.read(signaturePathsProvider.notifier).state = const [];
                  router.go('/onboarding-1');
                }),
              action('assets/sign-out.png', 'Log Out', onTap: () {
                Navigator.of(context).pop();
                ref.read(authStateProvider.notifier).signOut();
              }),
              _divider,
            ],
          ),
          // Paperclip pinning the card, poking up past the torn edge.
          Positioned(top: -21, left: 14, child: IgnorePointer(child: Image.asset('assets/paperclip.png', width: 68, height: 122))),
        ],
      ),
    );
  }
}

Future<void> showUpdateDataSheet(BuildContext context) =>
    showFlairSheet<void>(context, divider: false, above: _closeHeader, builder: (_) => const _UpdateDataSheet());

final List<int> _heights = [for (var v = 140; v <= 220; v++) v];
final List<int> _weights = [for (var v = 40; v <= 150; v++) v];

class _UpdateDataSheet extends ConsumerStatefulWidget {
  const _UpdateDataSheet();

  @override
  ConsumerState<_UpdateDataSheet> createState() => _UpdateDataSheetState();
}

class _UpdateDataSheetState extends ConsumerState<_UpdateDataSheet> {
  String _mode = 'form';
  late int _draftHeight = ref.read(heightProvider);
  late int _draftWeight = ref.read(weightProvider);

  void _save() {
    if (_mode == 'height') {
      ref.read(heightProvider.notifier).state = _draftHeight;
      setState(() => _mode = 'form');
    } else if (_mode == 'weight') {
      ref.read(weightProvider.notifier).state = _draftWeight;
      setState(() => _mode = 'form');
    } else {
      Navigator.of(context).pop();
    }
  }

  @override
  Widget build(BuildContext context) {
    final label = _funnel.copyWith(fontSize: 12, height: 16 / 12, letterSpacing: 0.06, fontWeight: FontWeight.bold);
    Widget unitField(String value, String unit, VoidCallback onTap, Key key) => GestureDetector(
          key: key,
          onTap: onTap,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
            decoration: BoxDecoration(color: const Color(0xFFF0F0F0), borderRadius: BorderRadius.circular(4)),
            child: Row(
              children: [
                Expanded(child: Text(value, style: _funnel.copyWith(fontSize: 16, height: 22 / 16))),
                Text(unit, style: _funnel.copyWith(fontSize: 14, height: 18 / 14, color: const Color(0xFF666666))),
              ],
            ),
          ),
        );

    final Widget body;
    if (_mode == 'form') {
      body = Padding(
        padding: const EdgeInsets.fromLTRB(24, 15, 24, 0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Name', style: label),
            const SizedBox(height: 16),
            TextFormField(
              key: const ValueKey('update_name'),
              initialValue: ref.read(cardNameProvider),
              maxLength: 75,
              cursorColor: const Color(0xFFFF0D00),
              onChanged: (v) => ref.read(cardNameProvider.notifier).state = v,
              style: _funnel.copyWith(fontSize: 16),
              decoration: InputDecoration(
                counterText: '',
                hintText: 'Your name',
                hintStyle: const TextStyle(color: Color(0xFF9A9A9A)),
                filled: true,
                fillColor: const Color(0xFFF0F0F0),
                contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(4), borderSide: BorderSide.none),
              ),
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                    Text('Height', style: label),
                    const SizedBox(height: 8),
                    unitField('${ref.watch(heightProvider)}', 'cm', () => setState(() => _mode = 'height'), const ValueKey('update_height')),
                  ]),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                    Text('Weight', style: label),
                    const SizedBox(height: 8),
                    unitField('${ref.watch(weightProvider)}', 'kg', () => setState(() => _mode = 'weight'), const ValueKey('update_weight')),
                  ]),
                ),
              ],
            ),
          ],
        ),
      );
    } else {
      final isHeight = _mode == 'height';
      body = Padding(
        padding: const EdgeInsets.only(top: 15),
        child: Column(
          children: [
            Text(isHeight ? 'Height (cm)' : 'Weight (kg)', style: _funnel.copyWith(fontSize: 16, height: 22 / 16, fontWeight: FontWeight.bold)),
            const SizedBox(height: 16),
            SizedBox(
              height: wheelItemHeight * wheelVisibleCount,
              child: Stack(
                children: [
                  const Positioned(
                    top: wheelItemHeight * (wheelVisibleCount ~/ 2),
                    left: 0,
                    right: 0,
                    height: wheelItemHeight,
                    child: ColoredBox(color: Color(0xFFF0F0F0)),
                  ),
                  WheelPicker<int>(
                    key: ValueKey(_mode),
                    items: isHeight ? _heights : _weights,
                    initialValue: isHeight ? _draftHeight : _draftWeight,
                    itemBuilder: (v) => Text('$v', style: _funnel.copyWith(fontSize: 16)),
                    onChanged: (v) => isHeight ? _draftHeight = v : _draftWeight = v,
                  ),
                ],
              ),
            ),
          ],
        ),
      );
    }

    return SizedBox(
      height: _bodyHeight(context),
      child: ListView(
        padding: const EdgeInsets.only(bottom: 40),
        children: [
          const SizedBox(height: 15),
          _divider,
          const Padding(
            padding: EdgeInsets.fromLTRB(24, 15, 24, 0),
            child: Text.rich(TextSpan(style: _bebas36, children: [
              TextSpan(text: 'U', style: _kirang44),
              TextSpan(text: 'PDAT'),
              TextSpan(text: 'E', style: _kirang44),
              TextSpan(text: ' D'),
              TextSpan(text: 'A', style: _kirang44),
              TextSpan(text: 'TA'),
            ])),
          ),
          const SizedBox(height: 15),
          _divider,
          body,
          Padding(
            padding: const EdgeInsets.fromLTRB(24, 32, 24, 0),
            child: GestureDetector(
              key: const ValueKey('update_save'),
              onTap: _save,
              child: Container(
                height: 56,
                decoration: BoxDecoration(color: Colors.black, borderRadius: BorderRadius.circular(99)),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Image.asset('assets/check.png', width: 18, height: 18, color: Colors.white),
                    const SizedBox(width: 10),
                    Text('Save', style: _funnel.copyWith(color: Colors.white, fontSize: 16, height: 24 / 16, letterSpacing: -0.24, fontWeight: FontWeight.w500)),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
