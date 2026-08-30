import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kurasi/core/design/wheel_picker.dart';

void main() {
  testWidgets('wheel shows items and calls onChanged', (tester) async {
    int? picked;
    await tester.pumpWidget(MaterialApp(
      home: SizedBox(
        height: 190,
        child: WheelPicker<int>(
          items: List.generate(5, (i) => 140 + i),
          itemBuilder: (v) => Text('$v'),
          initialValue: 142,
          onChanged: (v) => picked = v,
        ),
      ),
    ));
    expect(find.text('142'), findsOneWidget);
    await tester.fling(find.byType(WheelPicker<int>), const Offset(0, -120), 1000);
    await tester.pumpAndSettle();
    expect(picked, isNotNull);
  });
}