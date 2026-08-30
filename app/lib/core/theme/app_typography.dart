import 'package:flutter/material.dart';

class AppTypography {
  AppTypography._();
  static const double _trackingNegative = -0.16;
  static const double _captionTracking = 0.06;

  static double _displayLineHeight(double size) {
    switch (size) {
      case 64:
        return 70;
      case 48:
        return 52;
      case 36:
        return 40;
      case 32:
        return 36;
      default:
        return size * 1.1;
    }
  }

  static TextStyle display(double size) => TextStyle(
        fontFamily: 'BebasNeue',
        fontSize: size,
        height: _displayLineHeight(size) / size,
        color: Colors.white,
      );

  static TextStyle accentKirang(double size) => TextStyle(
        fontFamily: 'KirangHaerang',
        fontSize: size,
        height: _displayLineHeight(size) / size,
        color: Colors.white,
      );

  static const TextStyle body = TextStyle(
    fontFamily: 'FunnelSans',
    fontSize: 16,
    height: 22 / 16,
    letterSpacing: _trackingNegative,
  );

  static const TextStyle caption = TextStyle(
    fontFamily: 'FunnelSans',
    fontSize: 12,
    height: 16 / 12,
    letterSpacing: _captionTracking,
  );

  static const TextStyle buttonLabel = TextStyle(
    fontFamily: 'FunnelSans',
    fontSize: 16,
    fontWeight: FontWeight.w500,
    height: 24 / 16,
    letterSpacing: -0.24,
  );

  static const TextStyle slotLabel = TextStyle(
    fontFamily: 'FunnelSans',
    fontSize: 9,
    fontWeight: FontWeight.w700,
    height: 12 / 9,
    letterSpacing: 0.18,
  );
}