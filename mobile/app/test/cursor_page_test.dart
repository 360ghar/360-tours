import 'package:flutter_test/flutter_test.dart';

import 'package:tours360/core/models/api_dtos.dart';

void main() {
  Object? parse(Object? json) => CursorPage<int>.fromJson(json, (m) => 1);

  test('a page without items is rejected, not read as empty', () {
    expect(() => parse({'next_cursor': null, 'has_more': false, 'limit': 20}),
        throwsFormatException);
  });

  test('has_more without a cursor is rejected', () {
    expect(
        () => parse({'items': [], 'next_cursor': null, 'has_more': true, 'limit': 20}),
        throwsFormatException);
    expect(
        () => parse({'items': [], 'next_cursor': 7, 'has_more': true, 'limit': 20}),
        throwsFormatException);
  });

  test('a normal last page and a page with a cursor parse', () {
    expect(parse({'items': [], 'next_cursor': null, 'has_more': false, 'limit': 20}),
        isA<CursorPage<int>>());
    expect(parse({'items': [{}], 'next_cursor': 'c', 'has_more': true, 'limit': 20}),
        isA<CursorPage<int>>());
  });
}
