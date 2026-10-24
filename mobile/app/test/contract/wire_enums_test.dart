// The generated wire enums (lib/core/models/wire_enums.dart) against the enum
// values the backend publishes (test/fixtures/api/enums.json, written by
// tool/api_fixtures.py). A backend enum change fails here until
// tool/gen_enums.py is run.

import 'package:flutter_test/flutter_test.dart';
import 'package:tours360/core/models/wire_enums.dart';

import 'support.dart';

void main() {
  final published = fixture('enums');

  // name -> (every wire value the app knows, a lookup by wire value)
  final known = <String, (List<String>, Object? Function(Object?), String Function(Object))>{
    'AIJobStatus': (
      AIJobStatus.values.map((e) => e.wire).toList(),
      AIJobStatus.fromJson,
      (e) => (e as AIJobStatus).toJson(),
    ),
    'AIJobType': (
      AIJobType.values.map((e) => e.wire).toList(),
      AIJobType.fromJson,
      (e) => (e as AIJobType).toJson(),
    ),
    'HotspotType': (
      HotspotType.values.map((e) => e.wire).toList(),
      HotspotType.fromJson,
      (e) => (e as HotspotType).toJson(),
    ),
    'StorageFolderType': (
      StorageFolderType.values.map((e) => e.wire).toList(),
      StorageFolderType.fromJson,
      (e) => (e as StorageFolderType).toJson(),
    ),
    'TourStatus': (
      TourStatus.values.map((e) => e.wire).toList(),
      TourStatus.fromJson,
      (e) => (e as TourStatus).toJson(),
    ),
    'TourVisibility': (
      TourVisibility.values.map((e) => e.wire).toList(),
      TourVisibility.fromJson,
      (e) => (e as TourVisibility).toJson(),
    ),
    'UploadStatus': (
      UploadStatus.values.map((e) => e.wire).toList(),
      UploadStatus.fromJson,
      (e) => (e as UploadStatus).toJson(),
    ),
  };

  test('the app knows every enum it generated, and no other', () {
    expect(known.keys.toSet(), published.keys.toSet());
  });

  for (final entry in known.entries) {
    final (wires, fromJson, toJson) = entry.value;

    test('${entry.key}: the values match the backend, in order', () {
      expect(wires, (published[entry.key] as List).cast<String>());
    });

    test('${entry.key}: every wire value round-trips', () {
      for (final wire in wires) {
        final value = fromJson(wire);
        expect(value, isNotNull, reason: wire);
        expect(toJson(value!), wire);
      }
    });

    test('${entry.key}: null and an unknown value read as null', () {
      expect(fromJson(null), isNull);
      expect(fromJson('not_a_value_${entry.key}'), isNull);
      expect(fromJson(42), isNull);
    });
  }

  test('the backend sends tour_original, not the removed tour folder', () {
    expect(StorageFolderType.fromJson('tour_original'),
        StorageFolderType.tourOriginal);
    expect(StorageFolderType.fromJson('tour'), isNull);
  });

  test('capture-terminal "done" is not a value anywhere the app uses', () {
    for (final wires in published.values) {
      expect(wires, isNot(contains('done')));
    }
  });
}
