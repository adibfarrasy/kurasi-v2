import 'dart:ui' show ImageFilter;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/design/avatar_loader.dart';
import '../../core/design/membership_card_view.dart';
import '../../core/design/signature_pad.dart';
import 'avatar_job_state.dart';
import 'membership_state.dart';
import 'profile_state.dart';
import 'signature_state.dart';

/// Onboarding: customize the membership card (name, then signature) while
/// the avatar job runs above it. Starts the job whenever the captured face
/// changes.
class MembershipCardScreen extends ConsumerStatefulWidget {
  const MembershipCardScreen({super.key});

  @override
  ConsumerState<MembershipCardScreen> createState() => _MembershipCardScreenState();
}

/// Card panel slide-up and backdrop fade when the page opens.
const Duration _entrance = Duration(milliseconds: 350);

class _MembershipCardScreenState extends ConsumerState<MembershipCardScreen> with SingleTickerProviderStateMixin {
  String _step = 'name';
  bool _drawing = false;
  bool _openedPad = false;
  final _sigBoxKey = GlobalKey();

  /// Signature box's on-screen rect when the zoom started; null when idle.
  Rect? _sigRect;
  late final AnimationController _zoom = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 320),
    reverseDuration: const Duration(milliseconds: 280),
  );

  @override
  void dispose() {
    _zoom.dispose();
    super.dispose();
  }

  void _openPad() {
    final box = _sigBoxKey.currentContext?.findRenderObject() as RenderBox?;
    if (box == null) return;
    setState(() {
      _sigRect = box.localToGlobal(Offset.zero) & box.size;
      _openedPad = true;
      _drawing = true;
    });
    _zoom.forward(from: 0);
  }

  Future<void> _closePad() async {
    setState(() => _drawing = false);
    await _zoom.reverse();
    if (mounted) setState(() => _sigRect = null);
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final uri = ref.read(facePhotoProvider);
      final job = ref.read(avatarJobStateProvider).valueOrNull;
      if (uri != null && job != null && job.phase == 'idle') {
        ref.read(avatarJobStateProvider.notifier).startAvatarJob(uri: uri);
      }
    });
  }

  void _back() {
    if (_step == 'signature') {
      setState(() => _step = 'name');
    } else {
      context.pop();
    }
  }

  @override
  Widget build(BuildContext context) {
    ref.listen(facePhotoProvider, (previous, next) {
      if (next != null && next != previous) {
        ref.read(avatarJobStateProvider.notifier).startAvatarJob(uri: next);
      }
    });

    final name = ref.watch(cardNameProvider);
    final paths = ref.watch(signaturePathsProvider);
    final job = ref.watch(avatarJobStateProvider);
    final state = job.valueOrNull;
    final hasDrawn = paths.isNotEmpty;
    // Hold Continue until the avatar lands or fails; failures degrade to the mannequin.
    final avatarPending = job.isLoading || (state?.sessionId != null && !state!.isDone && !state.isError);
    final canContinue = _step == 'name' ? name.trim().isNotEmpty : hasDrawn && !avatarPending;
    final insets = MediaQuery.paddingOf(context);
    final headerH = insets.top + 48;
    // Once both name and signature are in, drop the blur so the avatar shows.
    final blurred = !(hasDrawn && name.trim().isNotEmpty);
    final hideTitle = _step == 'signature' && hasDrawn;

    return Scaffold(
      backgroundColor: const Color(0xFFEFEFEF),
      body: Stack(
        children: [
          Column(
            children: [
              SizedBox(
                height: headerH,
                child: Padding(
                  padding: EdgeInsets.only(top: insets.top + 8),
                  child: Stack(
                    children: [
                      Positioned(
                        left: 20,
                        top: 4,
                        child: GestureDetector(
                          key: const ValueKey('membership_back'),
                          onTap: _back,
                          child: Image.asset('assets/arrow-left.png', width: 24, height: 24),
                        ),
                      ),
                      Align(alignment: Alignment.topCenter, child: Image.asset('assets/logomark.png', width: 104, height: 40, color: Colors.black)),
                    ],
                  ),
                ),
              ),
              Expanded(
                // Hidden while zoomed: the top blur doesn't cover the legs.
                child: _sigRect != null
                    ? const SizedBox()
                    : const Padding(
                        padding: EdgeInsets.fromLTRB(0, 24, 0, 16),
                        child: Align(alignment: Alignment.topCenter, child: AvatarLoader()),
                      ),
              ),
            ],
          ),
          if (blurred)
            Positioned(
              left: 0,
              right: 0,
              top: headerH,
              bottom: 0,
              child: IgnorePointer(
                child: ClipRect(
                  // Fades in with the card panel's entrance.
                  child: TweenAnimationBuilder<double>(
                    tween: Tween(begin: 0, end: 1),
                    duration: _entrance,
                    curve: Curves.easeOut,
                    builder: (context, t, _) => BackdropFilter(
                      filter: ImageFilter.blur(sigmaX: 12 * t, sigmaY: 12 * t),
                      child: ColoredBox(color: Color.fromRGBO(255, 255, 255, 0.1 * t)),
                    ),
                  ),
                ),
              ),
            ),
          Positioned(
            left: 24,
            right: 24,
            bottom: 0,
            child: TweenAnimationBuilder<double>(
              tween: Tween(begin: 1, end: 0),
              duration: _entrance,
              curve: Curves.easeOutCubic,
              builder: (context, t, child) => FractionalTranslation(translation: Offset(0, t), child: child),
              child: Opacity(
                opacity: _sigRect != null ? 0 : 1,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Opacity(
                      opacity: hideTitle ? 0 : 1,
                      child: Text(
                        _step == 'name' ? 'Customize your membership card' : 'Next, add your signature',
                        textAlign: TextAlign.center,
                        style: const TextStyle(fontSize: 14, fontWeight: FontWeight.bold, height: 18 / 14, color: Colors.black),
                      ),
                    ),
                    const SizedBox(height: 16),
                    MembershipCardView(
                      name: name,
                      onChangeName: (v) => ref.read(cardNameProvider.notifier).state = v,
                      nameEditable: _step == 'name',
                      showSignatureBox: _step == 'signature',
                      hasSignature: _openedPad,
                      sigBoxKey: _sigBoxKey,
                      onPressSigBox: _openPad,
                    ),
                    const SizedBox(height: 24),
                    // Keeps the panel height stable until there's something to continue with.
                    Opacity(
                      opacity: _step == 'name' || hasDrawn ? 1 : 0,
                      child: GestureDetector(
                        key: const ValueKey('membership_continue'),
                        onTap: canContinue && (_step == 'name' || hasDrawn) ? () => _step == 'name' ? setState(() => _step = 'signature') : context.push('/onboarding/ai-credits') : null,
                        child: Container(
                          height: 56,
                          alignment: Alignment.center,
                          decoration: BoxDecoration(
                            color: canContinue ? Colors.black.withValues(alpha: 0.9) : const Color(0xFF9A9A9A),
                            borderRadius: BorderRadius.circular(999),
                          ),
                          child: const Text('Continue', style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w500, letterSpacing: -0.24)),
                        ),
                      ),
                    ),
                    SizedBox(height: insets.bottom + 16),
                  ],
                ),
              ),
            ),
          ),
          if (_sigRect != null) ..._zoomLayers(context, name, paths),
        ],
      ),
    );
  }

  /// Page-level copy of the card, scaled 3x around the signature box and
  /// moved so the box lands at screen center, with a fading top blur and
  /// the drawing surface laid over the zoomed box.
  List<Widget> _zoomLayers(BuildContext context, String name, List<String> paths) {
    final rect = _sigRect!;
    final screen = MediaQuery.sizeOf(context);
    final cardW = screen.width - 48;
    // Box sits at right/bottom 4 inside the 1pt border inside 15pt padding.
    const inset = 19.0;
    final cardRight = rect.right + inset;
    final cardBottom = rect.bottom + inset;
    final target = Offset(screen.width / 2, screen.height / 2);
    final padArea = Rect.fromCenter(center: target, width: rect.width * 3, height: rect.height * 3);
    return [
      AnimatedBuilder(
        animation: _zoom,
        builder: (context, _) => Positioned(
          left: 0,
          right: 0,
          top: 0,
          height: screen.height / 2 - 90,
          child: IgnorePointer(
            child: Opacity(
              opacity: _zoom.value,
              child: ShaderMask(
                blendMode: BlendMode.dstIn,
                shaderCallback: (b) => const LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [Colors.black, Colors.black, Colors.transparent],
                  stops: [0, 0.65, 1],
                ).createShader(b),
                child: ClipRect(
                  child: BackdropFilter(filter: ImageFilter.blur(sigmaX: 12, sigmaY: 12), child: const ColoredBox(color: Color(0x1AFFFFFF))),
                ),
              ),
            ),
          ),
        ),
      ),
      Positioned(
        right: screen.width - cardRight,
        bottom: screen.height - cardBottom,
        width: cardW,
        child: IgnorePointer(
          child: AnimatedBuilder(
            animation: _zoom,
            builder: (context, child) {
              final z = Curves.easeInOut.transform(_zoom.value);
              final scale = 1 + 2 * z;
              final box = context.findRenderObject() as RenderBox?;
              final h = box?.hasSize ?? false ? box!.size.height : 0.0;
              // Pivot is the box center in card-local coordinates.
              final pivot = Offset(cardW - inset - rect.width / 2, h - inset - rect.height / 2);
              final delta = (target - rect.center) * z;
              final m = Matrix4.identity()
                ..translateByDouble(delta.dx + pivot.dx, delta.dy + pivot.dy, 0, 1)
                ..scaleByDouble(scale, scale, 1, 1)
                ..translateByDouble(-pivot.dx, -pivot.dy, 0, 1);
              return Transform(transform: m, child: child);
            },
            child: MembershipCardView(name: name, showSignatureBox: true, hasSignature: true, hideSavedSignature: _drawing),
          ),
        ),
      ),
      if (_drawing)
        Positioned.fill(
          child: AnimatedBuilder(
            animation: _zoom,
            builder: (context, _) => IgnorePointer(
              // Drawing waits for the zoom to settle so stroke coordinates stay put.
              ignoring: _zoom.value < 1,
              child: SignaturePad(
                area: padArea,
                initial: paths,
                controlsOpacity: ((_zoom.value - 0.7) / 0.3).clamp(0.0, 1.0),
                onChanged: (p) => ref.read(signaturePathsProvider.notifier).state = p,
                onSave: _closePad,
              ),
            ),
          ),
        ),
    ];
  }
}
