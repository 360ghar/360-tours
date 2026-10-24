// The shared failure text and confirm dialog that the asset, room, hotspot and
// floor-plan screens use.

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tours360/core/api/api_exception.dart';
import 'package:tours360/core/ui/dialogs.dart';

void main() {
  group('failureReason', () {
    test('uses the server reason when the server answered', () {
      const e = ApiException(statusCode: 409, message: 'Tour is published');
      expect(failureReason(e), 'Tour is published');
    });

    test('gives a connection hint when no response arrived', () {
      const e = ApiException(message: 'Connection timed out', isNetwork: true);
      expect(failureReason(e), 'Check your connection and try again.');
    });

    test('gives a connection hint for an error that is not an API error', () {
      expect(failureReason(StateError('boom')),
          'Check your connection and try again.');
    });
  });

  group('confirmDialog', () {
    Future<Future<bool>> open(WidgetTester tester) async {
      late Future<bool> result;
      await tester.pumpWidget(MaterialApp(
        home: Builder(
          builder: (context) => TextButton(
            onPressed: () => result = confirmDialog(
              context,
              title: 'Delete this scan?',
              body: 'It is removed.',
              confirmLabel: 'Delete',
              destructive: true,
            ),
            child: const Text('open'),
          ),
        ),
      ));
      await tester.tap(find.text('open'));
      await tester.pumpAndSettle();
      expect(find.text('Delete this scan?'), findsOneWidget);
      return result;
    }

    testWidgets('resolves true on confirm', (tester) async {
      final result = await open(tester);
      await tester.tap(find.text('Delete'));
      await tester.pumpAndSettle();
      expect(await result, isTrue);
    });

    testWidgets('resolves false on cancel', (tester) async {
      final result = await open(tester);
      await tester.tap(find.text('Cancel'));
      await tester.pumpAndSettle();
      expect(await result, isFalse);
    });

    testWidgets('resolves false when dismissed outside the dialog',
        (tester) async {
      final result = await open(tester);
      await tester.tapAt(const Offset(5, 5));
      await tester.pumpAndSettle();
      expect(await result, isFalse);
    });
  });
}
