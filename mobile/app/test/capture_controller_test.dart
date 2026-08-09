import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tours360/features/capture/domain/capture_targets.dart';
import 'package:tours360/features/capture/presentation/capture_controller.dart';

void main() {
  late ProviderContainer container;
  late CaptureController controller;

  setUp(() {
    container = ProviderContainer();
    controller = container.read(captureControllerProvider.notifier);
  });

  tearDown(() => container.dispose());

  test('skip on last target with too few frames sets needMoreShots', () {
    controller.setStateForTest(
      CaptureState(
        phase: CapturePhase.aiming,
        targetIndex: kFallbackCapturePlan.total - 1,
        framePaths: const ['a', 'b', 'c'],
      ),
    );
    controller.skipTarget();
    final state = container.read(captureControllerProvider);
    expect(state.phase, CapturePhase.aiming);
    expect(state.needMoreShots, isTrue);
    expect(state.targetIndex, kFallbackCapturePlan.total - 1);
  });

  test('skip on last target with >= 4 frames goes to review', () {
    controller.setStateForTest(
      CaptureState(
        phase: CapturePhase.aiming,
        targetIndex: kFallbackCapturePlan.total - 1,
        framePaths: const ['a', 'b', 'c', 'd'],
      ),
    );
    controller.skipTarget();
    final state = container.read(captureControllerProvider);
    expect(state.phase, CapturePhase.review);
    expect(state.needMoreShots, isFalse);
  });

  test('skip mid-sequence advances targetIndex without review', () {
    controller.setStateForTest(
      const CaptureState(
        phase: CapturePhase.aiming,
        targetIndex: 2,
        framePaths: ['a'],
      ),
    );
    controller.skipTarget();
    final state = container.read(captureControllerProvider);
    expect(state.phase, CapturePhase.aiming);
    expect(state.targetIndex, 3);
    expect(state.needMoreShots, isFalse);
  });

  test('skip records the skipped target for the completion gate', () {
    controller.setStateForTest(
      const CaptureState(
        phase: CapturePhase.aiming,
        targetIndex: 2,
        framePaths: ['a'],
      ),
    );
    controller.skipTarget();
    final state = container.read(captureControllerProvider);
    expect(state.skippedTargets, {2});
    // The missing-angles check knows target 2 is uncovered.
    expect(
      state.effectivePlan.missingTargets(state.capturedTargets.toSet()),
      contains(2),
    );
  });

  test('retakeMissingAngles jumps back to the first uncovered target', () {
    controller.setStateForTest(
      const CaptureState(
        phase: CapturePhase.review,
        targetIndex: 1,
        framePaths: ['a', 'b'],
        capturedTargets: [0, 2],
        skippedTargets: {1},
        captureComplete: true,
      ),
    );
    controller.retakeMissingAngles();
    final state = container.read(captureControllerProvider);
    expect(state.phase, CapturePhase.aiming);
    expect(state.targetIndex, 1);
    expect(state.captureComplete, isFalse);
  });

  test('retakeMissingAngles on a complete session does nothing', () {
    controller.setStateForTest(
      CaptureState(
        phase: CapturePhase.review,
        targetIndex: kFallbackCapturePlan.total - 1,
        framePaths: [for (var i = 0; i < kFallbackCapturePlan.total; i++) '$i'],
        capturedTargets: [
          for (var i = 0; i < kFallbackCapturePlan.total; i++) i,
        ],
      ),
    );
    controller.retakeMissingAngles();
    expect(
      container.read(captureControllerProvider).phase,
      CapturePhase.review,
    );
  });
}
