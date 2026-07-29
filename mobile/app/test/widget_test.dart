// Smoke test: the app-level theme builds and renders.
// Full app boot needs Supabase env; behavior is covered by the unit tests
// in this folder.

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tours360/core/theme/app_theme.dart';

void main() {
  testWidgets('dark theme renders a scaffold', (tester) async {
    await tester.pumpWidget(MaterialApp(
      theme: AppTheme.dark(),
      home: const Scaffold(body: Text('360 Tours')),
    ));
    expect(find.text('360 Tours'), findsOneWidget);
  });
}
