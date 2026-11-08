import 'dart:ui' show ImageFilter;

import 'package:flutter/material.dart';

/// Torn-paper top edge: the 393x12 tile repeated to cover the width.
/// [edge] renders only the stroke marks, for use over a non-paper backdrop.
class TopFlair extends StatelessWidget {
  const TopFlair({super.key, this.edge = false});

  final bool edge;

  @override
  Widget build(BuildContext context) {
    final asset = edge ? 'assets/top-flair-edge.png' : 'assets/top-flair.png';
    return SizedBox(
      height: 12,
      child: ClipRect(
        child: OverflowBox(
          alignment: Alignment.centerLeft,
          maxWidth: double.infinity,
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Image.asset(asset, width: 393, height: 12, fit: BoxFit.fill),
              const SizedBox(width: 6),
              Image.asset(asset, width: 393, height: 12, fit: BoxFit.fill),
            ],
          ),
        ),
      ),
    );
  }
}

/// Shared bottom-sheet treatment: torn-paper handle on a white card that
/// slides over a light blurred backdrop.
///
/// [above] renders over the backdrop above the torn edge; [divider] adds the
/// hairline under the handle.
Future<T?> showFlairSheet<T>(BuildContext context, {required WidgetBuilder builder, WidgetBuilder? above, bool divider = true}) {
  final navigator = Navigator.of(context, rootNavigator: true);
  return navigator.push(_FlairSheetRoute<T>(
    capturedThemes: InheritedTheme.capture(from: context, to: navigator.context),
    builder: (sheetContext) => Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (above != null) above(sheetContext),
        const TopFlair(),
        ColoredBox(
          color: Colors.white,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (divider) ...[
                const SizedBox(height: 15),
                const Divider(height: 1, thickness: 1, color: Color(0xFFE5E5E5)),
              ],
              Padding(
                padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(sheetContext).bottom),
                child: builder(sheetContext),
              ),
            ],
          ),
        ),
      ],
    ),
  ));
}

/// Bottom-sheet route whose barrier is a blur that fades in place while the
/// sheet slides, instead of a flat scrim.
class _FlairSheetRoute<T> extends ModalBottomSheetRoute<T> {
  _FlairSheetRoute({required super.builder, super.capturedThemes})
      : super(
          isScrollControlled: true,
          useSafeArea: true,
          backgroundColor: Colors.transparent,
          elevation: 0,
          modalBarrierColor: const Color(0x1AFFFFFF),
        );

  @override
  Widget buildModalBarrier() {
    return Stack(
      fit: StackFit.expand,
      children: [
        IgnorePointer(
          child: AnimatedBuilder(
            animation: animation!,
            builder: (context, _) {
              final sigma = 12 * animation!.value;
              return BackdropFilter(filter: ImageFilter.blur(sigmaX: sigma, sigmaY: sigma), child: const SizedBox.expand());
            },
          ),
        ),
        super.buildModalBarrier(),
      ],
    );
  }
}
