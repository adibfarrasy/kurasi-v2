import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../features/onboarding/profile_state.dart';
import '../../features/onboarding/signature_state.dart';
import 'signature_pad.dart';

/// Signature strokes are recorded on a 300x180 pad and shown at 100x60.
const Size signatureCanvas = Size(300, 180);

/// The paper membership card: face photo, name, model/gender/size rows,
/// issue date, and the optional dashed signature box. Profile values come
/// from the onboarding providers so every copy of the card stays in sync.
class MembershipCardView extends ConsumerWidget {
  const MembershipCardView({
    super.key,
    required this.name,
    this.onChangeName,
    this.nameEditable = false,
    this.showSignatureBox = false,
    this.hasSignature = false,
    this.onPressSigBox,
    this.hideSavedSignature = false,
    this.sigBoxKey,
  });

  /// Lets the page measure the signature box to zoom the card around it.
  final GlobalKey? sigBoxKey;

  final String name;
  final ValueChanged<String>? onChangeName;
  final bool nameEditable;
  final bool showSignatureBox;
  final bool hasSignature;
  final VoidCallback? onPressSigBox;

  /// Hides the saved strokes while the signature pad draws its own copy.
  final bool hideSavedSignature;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final gender = ref.watch(genderProvider);
    final height = ref.watch(heightProvider);
    final weight = ref.watch(weightProvider);
    final face = ref.watch(facePhotoProvider);
    final paths = ref.watch(signaturePathsProvider);
    const line = BorderSide(color: Color(0xFF8F8F8F));
    const grey = TextStyle(fontFamily: 'FunnelSans', fontSize: 14, color: Color(0xFF666666));
    final now = DateTime.now();
    String two(int v) => v.toString().padLeft(2, '0');
    final faceFile = face == null ? null : File(Uri.tryParse(face)?.scheme == 'file' ? Uri.parse(face).toFilePath() : face);

    Widget row(Widget child, {bool border = true, EdgeInsets padding = const EdgeInsets.symmetric(horizontal: 11, vertical: 4)}) => Container(
          padding: padding,
          alignment: Alignment.centerLeft,
          decoration: BoxDecoration(border: border ? const Border(bottom: line) : null),
          child: child,
        );

    return Stack(
      clipBehavior: Clip.none,
      children: [
        Positioned(left: 5, top: 5, right: -5, bottom: -5, child: Image.asset('assets/card-shadow.png', fit: BoxFit.fill)),
        Transform.rotate(
          angle: -0.5 * 3.14159 / 180,
          child: Container(
            padding: const EdgeInsets.all(15),
            clipBehavior: Clip.antiAlias,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(8),
              gradient: const LinearGradient(
                begin: Alignment(-1, -0.14),
                end: Alignment(1, 0.14),
                colors: [Color(0xFFF0F0F0), Color(0xFFF0F0F0), Colors.white, Color(0xFFF0F0F0), Color(0xFFF0F0F0)],
                stops: [0, 0.1495, 0.5001, 0.7505, 1],
              ),
            ),
            child: Stack(
              clipBehavior: Clip.none,
              children: [
                Container(
                  decoration: BoxDecoration(border: Border.all(color: const Color(0xFF8F8F8F))),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      IntrinsicHeight(
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            SizedBox(
                              width: 110,
                              child: faceFile != null && faceFile.existsSync()
                                  ? Image.file(faceFile, fit: BoxFit.cover)
                                  : const ColoredBox(color: Color(0xFFDDDDDD)),
                            ),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.stretch,
                                children: [
                                  row(
                                    Transform.rotate(
                                      angle: 0.5 * 3.14159 / 180,
                                      child: TextFormField(
                                        key: const ValueKey('card_name'),
                                        initialValue: name,
                                        enabled: nameEditable,
                                        onChanged: (t) => onChangeName?.call(t.replaceAll('\n', ' ')),
                                        cursorColor: const Color(0xFFFF0D00),
                                        style: const TextStyle(fontFamily: 'FunnelSans', fontSize: 20, height: 24 / 20, fontWeight: FontWeight.bold, letterSpacing: -0.3, color: Colors.black),
                                        decoration: const InputDecoration(
                                          isCollapsed: true,
                                          border: InputBorder.none,
                                          hintText: 'Insert your name',
                                          hintStyle: TextStyle(color: Color(0xFF9A9A9A)),
                                        ),
                                      ),
                                    ),
                                    padding: const EdgeInsets.all(11),
                                  ),
                                  row(Row(children: [
                                    Image.asset('assets/logomark-dark.png', width: 50, height: 18),
                                    const SizedBox(width: 10),
                                    const Text('model', style: grey),
                                  ])),
                                  row(Text(gender, style: grey)),
                                  row(Text('${height}cm • ${weight}kg', style: grey), border: false),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                      Container(
                        padding: const EdgeInsets.fromLTRB(11, 8, 8, 8),
                        decoration: const BoxDecoration(border: Border(top: line)),
                        child: Text('Issued on ${two(now.month)}/${two(now.day)}/${now.year}', style: grey.copyWith(fontSize: 12)),
                      ),
                    ],
                  ),
                ),
                if (showSignatureBox)
                  Positioned(
                    right: 4,
                    bottom: 4,
                    width: 100,
                    height: 60,
                    child: GestureDetector(
                      key: sigBoxKey ?? const ValueKey('card_signature_box'),
                      onTap: onPressSigBox,
                      child: Opacity(opacity: hasSignature ? 0.5 : 1, child: Image.asset('assets/signature-box.png', fit: BoxFit.contain)),
                    ),
                  ),
                if (!hideSavedSignature && paths.isNotEmpty)
                  Positioned(
                    right: 4,
                    bottom: 4,
                    width: 100,
                    height: 60,
                    child: IgnorePointer(
                      child: FittedBox(
                        child: SizedBox.fromSize(
                          size: signatureCanvas,
                          child: CustomPaint(painter: SignaturePainter(paths: paths, color: Colors.black, strokeWidth: 3)),
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}
