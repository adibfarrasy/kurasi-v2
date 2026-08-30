import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kurasi/core/design/signature_pad.dart';

void main() {
  testWidgets('signature pad accumulates strokes and erases', (tester) async {
    List<String> paths = [];
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(body: SignaturePad(onChanged: (p) => paths = p)),
    ));
    final center = tester.getCenter(find.byType(SignaturePad));
    final gesture = await tester.startGesture(center);
    await gesture.moveBy(const Offset(30, 10));
    await gesture.up();
    await tester.pump();
    expect(paths, isNotEmpty);
    await tester.tap(find.text('Erase'));
    await tester.pump();
    expect(paths, isEmpty);
  });
}