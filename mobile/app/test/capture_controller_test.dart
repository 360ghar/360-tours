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
    controller.setStateForTest(CaptureState(
      phase: CapturePhase.aiming,
      targetIndex: kCaptureTargets.length - 1,
      framePaths: const ['a', 'b', 'c'],
    ));
    controller.skipTarget();
    final state = container.read(captureControllerProvider);
    expect(state.phase, CapturePhase.aiming);
    expect(state.needMoreShots, isTrue);
    expect(state.targetIndex, kCaptureTargets.length - 1);
  });

  test('skip on last target with >= 4 frames goes to review', () {
    controller.setStateForTest(CaptureState(
      phase: CapturePhase.aiming,
      targetIndex: kCaptureTargets.length - 1,
      framePaths: const ['a', 'b', 'c', 'd'],
    ));
    controller.skipTarget();
    final state = container.read(captureControllerProvider);
    expect(state.phase, CapturePhase.review);
    expect(state.needMoreShots, isFalse);
  });

  test('skip mid-sequence advances targetIndex without review', () {
    controller.setStateForTest(const CaptureState(
      phase: CapturePhase.aiming,
      targetIndex: 2,
      framePaths: ['a'],
    ));
    controller.skipTarget();
    final state = container.read(captureControllerProvider);
    expect(state.phase, CapturePhase.aiming);
    expect(state.targetIndex, 3);
    expect(state.needMoreShots, isFalse);
  });
}
