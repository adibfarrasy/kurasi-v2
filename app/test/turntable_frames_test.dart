import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:kurasi/features/tryon/turntable_view.dart';

void main() {
  test('unpackFrames splits the backend pack', () {
    // Same layout as backend turntable::pack_frames_layout: frames [1, 2] and [3].
    final bytes = Uint8List.fromList([
      ...'KTF1'.codeUnits, 2, 0, 0, 0, 2, 0, 0, 0, 1, 0, 0, 0, 1, 2, 3, //
    ]);
    final frames = unpackFrames(bytes);
    expect(frames.map((f) => f.toList()), [
      [1, 2],
      [3],
    ]);
  });

  test('unpackFrames rejects other files', () {
    expect(() => unpackFrames(Uint8List.fromList('nope1234'.codeUnits)), throwsFormatException);
  });
}
