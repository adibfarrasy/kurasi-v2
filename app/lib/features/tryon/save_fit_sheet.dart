import 'package:flutter/material.dart';
import '../../core/design/flair_sheet.dart';

/// Asks for the fit's name. Resolves to the trimmed name (possibly empty)
/// on confirm, or null when dismissed.
Future<String?> showSaveFitSheet(BuildContext context) =>
    showFlairSheet<String>(context, builder: (_) => const _SaveFitSheet());

class _SaveFitSheet extends StatefulWidget {
  const _SaveFitSheet();

  @override
  State<_SaveFitSheet> createState() => _SaveFitSheetState();
}

class _SaveFitSheetState extends State<_SaveFitSheet> {
  final _controller = TextEditingController();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    const bebas = TextStyle(fontFamily: 'BebasNeue', fontSize: 36, height: 40 / 36, color: Colors.black);
    const kirang = TextStyle(fontFamily: 'KirangHaerang', fontSize: 44, height: 40 / 44, color: Colors.black);
    const divider = Divider(height: 1, thickness: 1, color: Color(0xFFE5E5E5));
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const Padding(
          padding: EdgeInsets.fromLTRB(20, 24, 20, 15),
          child: Text.rich(TextSpan(children: [
            TextSpan(text: 'SA', style: bebas),
            TextSpan(text: 'V', style: kirang),
            TextSpan(text: 'E ', style: bebas),
            TextSpan(text: 'T', style: kirang),
            TextSpan(text: 'O ', style: bebas),
            TextSpan(text: 'M', style: kirang),
            TextSpan(text: 'Y ', style: bebas),
            TextSpan(text: 'F', style: kirang),
            TextSpan(text: 'IT', style: bebas),
          ])),
        ),
        divider,
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 15),
          child: TextField(
            key: const ValueKey('save_fit_name'),
            controller: _controller,
            style: const TextStyle(fontFamily: 'FunnelSans', fontSize: 16, height: 22 / 16, color: Colors.black),
            decoration: InputDecoration(
              hintText: 'Name the fit',
              hintStyle: const TextStyle(color: Color(0xFF999999)),
              filled: true,
              fillColor: const Color(0xFFF2F2F2),
              contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 17),
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: BorderSide.none),
            ),
          ),
        ),
        divider,
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 15, 20, 50),
          child: GestureDetector(
            key: const ValueKey('save_fit_confirm'),
            onTap: () => Navigator.of(context).pop(_controller.text.trim()),
            child: Container(
              height: 56,
              decoration: BoxDecoration(color: Colors.black, borderRadius: BorderRadius.circular(99)),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Image.asset('assets/bookmark-simple.png', width: 20, height: 20, color: Colors.white),
                  const SizedBox(width: 8),
                  const Text(
                    'Save to My Fit',
                    style: TextStyle(fontFamily: 'FunnelSans', fontSize: 16, height: 24 / 16, letterSpacing: -0.24, fontWeight: FontWeight.w500, color: Colors.white),
                  ),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }
}
