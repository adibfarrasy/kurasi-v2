import 'package:flutter/material.dart';
import 'app_colors.dart';
import 'app_typography.dart';

class AppTheme {
  AppTheme._();
  static ThemeData light = ThemeData(
    scaffoldBackgroundColor: AppColors.page,
    colorScheme: const ColorScheme.light(
      primary: AppColors.accent,
      surface: Colors.white,
      onSurface: AppColors.textPrimary,
    ),
    fontFamily: 'FunnelSans',
    textTheme: const TextTheme(
      bodyMedium: AppTypography.body,
      bodySmall: AppTypography.caption,
    ),
    splashFactory: NoSplash.splashFactory,
  );
  static ThemeData dark = ThemeData(
    scaffoldBackgroundColor: AppColors.dark,
    colorScheme: const ColorScheme.dark(
      primary: AppColors.accent,
      surface: AppColors.darkMid,
      onSurface: AppColors.textOnDark,
    ),
    fontFamily: 'FunnelSans',
    textTheme: const TextTheme(
      bodyMedium: AppTypography.body,
      bodySmall: AppTypography.caption,
    ),
    splashFactory: NoSplash.splashFactory,
  );
}