import 'package:flutter/material.dart';

/// Dark, monochrome real-estate UI. One accent, used sparingly and tonally.
abstract final class AppColors {
  static const background = Color(0xFF0A0A0A);
  static const surface = Color(0xFF161616);
  static const surfaceRaised = Color(0xFF1F1F1F);
  static const ink = Color(0xFFF4F2EE);
  static const inkDim = Color(0xFF9A9691);
  static const inkFaint = Color(0xFF565350);

  /// The single brand accent: warm brass. Never paired with a second hue.
  static const accent = Color(0xFFD9B98C);
  static const accentDim = Color(0xFF8A7457);

  static const danger = Color(0xFFCF6A5E);
  static const success = Color(0xFF9CB98A);
}

abstract final class AppTheme {
  static ThemeData dark() {
    const scheme = ColorScheme.dark(
      surface: AppColors.background,
      surfaceContainer: AppColors.surface,
      surfaceContainerHigh: AppColors.surfaceRaised,
      primary: AppColors.accent,
      onPrimary: Color(0xFF14100A),
      secondary: AppColors.accentDim,
      onSurface: AppColors.ink,
      onSurfaceVariant: AppColors.inkDim,
      error: AppColors.danger,
      outline: Color(0xFF2A2A2A),
    );

    final base = ThemeData(
      useMaterial3: true,
      colorScheme: scheme,
      scaffoldBackgroundColor: AppColors.background,
    );

    return base.copyWith(
      textTheme: base.textTheme.apply(
        bodyColor: AppColors.ink,
        displayColor: AppColors.ink,
      ),
      appBarTheme: const AppBarTheme(
        backgroundColor: AppColors.background,
        foregroundColor: AppColors.ink,
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: false,
        titleTextStyle: TextStyle(
          color: AppColors.ink,
          fontSize: 20,
          fontWeight: FontWeight.w600,
          letterSpacing: -0.3,
        ),
      ),
      cardTheme: const CardThemeData(
        color: AppColors.surface,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.all(Radius.circular(14)),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: AppColors.ink,
          foregroundColor: AppColors.background,
          minimumSize: const Size(64, 52),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
          textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(foregroundColor: AppColors.inkDim),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: AppColors.surface,
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide.none,
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: AppColors.accentDim),
        ),
        hintStyle: const TextStyle(color: AppColors.inkFaint),
      ),
      dividerTheme: const DividerThemeData(
        color: Color(0xFF232323),
        thickness: 1,
        space: 1,
      ),
      snackBarTheme: SnackBarThemeData(
        backgroundColor: AppColors.surfaceRaised,
        contentTextStyle: const TextStyle(color: AppColors.ink),
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
        ),
      ),
      progressIndicatorTheme: const ProgressIndicatorThemeData(
        color: AppColors.accent,
        linearTrackColor: AppColors.surfaceRaised,
      ),
    );
  }
}
