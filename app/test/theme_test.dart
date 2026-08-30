import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kurasi/core/theme/app_colors.dart';
import 'package:kurasi/core/theme/app_typography.dart';

void main() {
  test('accent is brand red', () {
    expect(AppColors.accent, const Color(0xFFFF0D00));
  });
  test('canvas background', () {
    expect(AppColors.canvas, const Color(0xFFF0F0F0));
  });
  test('display uses bebas family', () {
    final s = AppTypography.display(48);
    expect(s.fontFamily, 'BebasNeue');
  });
  test('kirang accent larger than base', () {
    final base = AppTypography.display(48);
    final kir = AppTypography.accentKirang(48);
    expect(kir.fontFamily, 'KirangHaerang');
    expect(kir.fontSize, base.fontSize);
  });
  test('body uses funnel', () {
    expect(AppTypography.body.fontFamily, 'FunnelSans');
    expect(AppTypography.body.fontSize, 16);
  });
}