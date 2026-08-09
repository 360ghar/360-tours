import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:tours360/core/models/models.dart';
import 'package:tours360/core/storage/local_store.dart';
import 'package:tours360/features/capture/data/capture_session_store.dart';
import 'package:tours360/features/capture/domain/capture_session.dart';
import 'package:tours360/features/capture/domain/capture_targets.dart';

void main() {
  late Directory dir;
  late LocalStore store;
  late CaptureSessionStore sessionStore;

  setUp(() async {
    dir = await Directory.systemTemp.createTemp('tours360_session');
    store = LocalStore(dir);
    sessionStore = CaptureSessionStore(store);
  });

  tearDown(() => dir.delete(recursive: true));

  CaptureSession session({
    int targetIndex = 2,
    List<CapturedFrameRecord> frames = const [],
    List<int> skipped = const [],
  }) => CaptureSession(
    id: 's1',
    createdAt: DateTime(2026, 8, 8),
    profile: CameraProfile.fallbackWide,
    targetIndex: targetIndex,
    frames: frames,
    skippedTargets: skipped,
  );

  CapturedFrameRecord frame(int targetIndex) => CapturedFrameRecord(
    targetIndex: targetIndex,
    path: '${dir.path}/frame_$targetIndex.jpg',
    orientation: FrameOrientation(yaw: 36 * targetIndex.toDouble(), pitch: 0),
    lowQuality: targetIndex == 1,
  );

  test('persist -> load round-trip keeps every field', () async {
    final original = session(
      targetIndex: 7,
      frames: [frame(0), frame(1), frame(2)],
      skipped: [5],
    );
    await sessionStore.save(original);

    final loaded = await sessionStore.load();
    expect(loaded, isNotNull);
    expect(loaded!.id, 'active', reason: 'single active session key');
    expect(loaded.targetIndex, 7);
    expect(loaded.profile.hFovDeg, 55);
    expect(loaded.profile.vFovDeg, 69);
    expect(loaded.frames.length, 3);
    expect(loaded.frames[0].targetIndex, 0);
    expect(loaded.frames[1].lowQuality, isTrue);
    expect(loaded.frames[2].orientation.yaw, 72);
    expect(loaded.skippedTargets, [5]);
  });

  test('resume scenario: capture 1 + 2, persist, fresh instance reloads, '
      'frames remain, correct target resumes', () async {
    await File(frame(0).path).writeAsString('jpeg0');
    await File(frame(1).path).writeAsString('jpeg1');
    await sessionStore.save(
      session(targetIndex: 2, frames: [frame(0), frame(1)]),
    );

    // Simulate app restart: fresh store over the same directory.
    final fresh = CaptureSessionStore(LocalStore(dir));
    final loaded = await fresh.load();
    expect(loaded, isNotNull);
    expect(loaded!.targetIndex, 2, reason: 'resume at the NEXT target');
    expect(loaded.frames.length, 2, reason: 'previous frames remain');
    expect(CaptureSessionStore.framesIntact(loaded), isTrue);
  });

  test('discard cleans up: record removed and frame files deleted', () async {
    await File(frame(0).path).writeAsString('jpeg');
    await File(frame(1).path).writeAsString('jpeg');
    await sessionStore.save(
      session(targetIndex: 2, frames: [frame(0), frame(1)]),
    );

    CaptureSessionStore.deleteFrameFiles((await sessionStore.load())!);
    await sessionStore.clear();

    expect(await sessionStore.load(), isNull);
    expect(File(frame(0).path).existsSync(), isFalse);
    expect(File(frame(1).path).existsSync(), isFalse);
  });

  test('zero-progress session is not offered for resume', () async {
    await sessionStore.save(session(targetIndex: 0));
    expect(await sessionStore.load(), isNull);
  });

  test('corrupt session payload never crashes (start-new path)', () async {
    await store.upsert('capture_sessions', {'id': 'active', 'broken': true});
    // targetIndex 0, no frames -> treated as unrecoverable, load returns null
    expect(await sessionStore.load(), isNull);

    await store.upsert('capture_sessions', {
      'id': 'active',
      'targetIndex': 'not-a-number',
      'frames': 'nope',
    });
    final loaded = await sessionStore.load();
    expect(loaded, isNull);
  });

  test(
    'missing frame files make a session unrecoverable (not resumable)',
    () async {
      // Path points at a file that was deleted (app-data wiped).
      await sessionStore.save(session(targetIndex: 3, frames: [frame(0)]));
      final loaded = await sessionStore.load();
      expect(loaded, isNotNull);
      expect(CaptureSessionStore.framesIntact(loaded!), isFalse);
    },
  );

  test('rebuilds a matching plan from the persisted profile', () {
    final loaded = CaptureSession.fromJson(session(targetIndex: 4).toJson());
    final plan = const CaptureTargetPlanner().createPlan(loaded.profile);
    expect(plan.total, kFallbackCapturePlan.total);
    expect(loaded.targetIndex, lessThan(plan.total));
  });
}
