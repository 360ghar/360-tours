// 3D-generation job persistence: re-entering the screen must resume the
// stored job instead of spawning a duplicate backend job, set the asset to
// processing3d while running, and revert it on failure.

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tours360/core/api/backend_api.dart';
import 'package:tours360/core/models/models.dart';
import 'package:tours360/core/providers.dart';
import 'package:tours360/features/assets/data/local_asset_repository.dart';
import 'package:tours360/features/threed/presentation/generate_3d_screen.dart';

import 'fakes.dart';

class _FakeApi extends BackendApi {
  _FakeApi() : super(Dio());

  String jobStatus = 'running';
  int startCalls = 0;
  int pollCalls = 0;
  bool failStart = false;

  @override
  Future<Map<String, dynamic>> generate3dWorld(String tourId) async {
    startCalls++;
    if (failStart) {
      throw DioException(requestOptions: RequestOptions(path: '/generate-3d'));
    }
    return {'id': 'job-1', 'status': 'queued'};
  }

  @override
  Future<Map<String, dynamic>> getAiJob(String jobId) async {
    pollCalls++;
    switch (jobStatus) {
      case 'completed':
        return {'status': 'completed'};
      case 'failed':
        return {'status': 'failed', 'error_message': 'mesh failed'};
      default:
        return {'status': 'running', 'progress': 42};
    }
  }
}

ScanAsset makeAsset({
  String id = 'a1',
  AssetStatus status = AssetStatus.ready,
  String? tourId = 'tour-1',
}) =>
    ScanAsset(
      id: id,
      ownerId: 'u1',
      name: 'Living room',
      status: status,
      createdAt: DateTime(2026),
      remoteTourId: tourId,
    );

Widget harness(FakeAssetRepository repo, BackendApi api) => ProviderScope(
      overrides: [
        assetRepositoryProvider.overrideWithValue(repo),
        backendApiProvider.overrideWithValue(api),
        authRepositoryProvider.overrideWithValue(FakeAuthRepository()),
      ],
      child: const MaterialApp(
        home: Generate3dScreen(assetId: 'a1'),
      ),
    );

void main() {
  testWidgets('resumes a persisted running job instead of starting a new one',
      (tester) async {
    final repo = FakeAssetRepository();
    await repo.saveAsset(makeAsset(status: AssetStatus.processing3d));
    await repo.save3dJob(
      assetId: 'a1',
      job: const PersistedAiJob(jobId: 'job-1', status: 'running'),
    );
    final api = _FakeApi();

    await tester.pumpWidget(harness(repo, api));
    await tester.pump();

    // Resumed: no new backend job, progress UI instead of a Generate button.
    // ("Generating…" appears in the headline and the progress line.)
    expect(api.startCalls, 0);
    expect(find.text('Generate 3D world'), findsNothing);
    expect(find.textContaining('Generating…'), findsWidgets);

    // First poll completes the job.
    api.jobStatus = 'completed';
    await tester.pump(const Duration(seconds: 5));
    await tester.pump();
    await tester.pump();

    expect(api.pollCalls, greaterThanOrEqualTo(1));
    expect(find.text('View 3D world'), findsOneWidget);
    final saved = await repo.getAsset('a1');
    expect(saved!.model3dUrl, contains('/view3d/tour-1'));
    expect(saved.type, AssetType.model3d);
    expect(saved.status, AssetStatus.ready);
    // The durable marker is model3dUrl — the job record is dropped.
    expect(await repo.get3dJob('a1'), isNull);
  });

  testWidgets('starting generation persists the job and sets processing3d',
      (tester) async {
    final repo = FakeAssetRepository();
    await repo.saveAsset(makeAsset());
    final api = _FakeApi();

    await tester.pumpWidget(harness(repo, api));
    await tester.pump();
    expect(find.text('Generate 3D world'), findsOneWidget);

    await tester.tap(find.text('Generate 3D world'));
    await tester.pump();
    await tester.pump();

    expect(api.startCalls, 1);
    final running = await repo.getAsset('a1');
    expect(running!.status, AssetStatus.processing3d,
        reason: 'badge/status surfaces must reflect the running 3D job');
    final job = await repo.get3dJob('a1');
    expect(job!.jobId, 'job-1');
    expect(job.status, 'running');

    // Finish the job so the poll timer is cancelled before the test ends.
    api.jobStatus = 'completed';
    await tester.pump(const Duration(seconds: 5));
    await tester.pump();
    expect(find.text('View 3D world'), findsOneWidget);
  });

  testWidgets('a failed job reverts the asset to ready and shows the error',
      (tester) async {
    final repo = FakeAssetRepository();
    await repo.saveAsset(makeAsset(status: AssetStatus.processing3d));
    await repo.save3dJob(
      assetId: 'a1',
      job: const PersistedAiJob(jobId: 'job-1', status: 'running'),
    );
    final api = _FakeApi()..jobStatus = 'failed';

    await tester.pumpWidget(harness(repo, api));
    await tester.pump();
    await tester.pump(const Duration(seconds: 5));
    await tester.pump();

    expect(find.text('mesh failed'), findsOneWidget);
    expect(find.text('Retry generation'), findsOneWidget);
    final reverted = await repo.getAsset('a1');
    expect(reverted!.status, AssetStatus.ready,
        reason: 'the pano is fine — only the 3D job failed');
    final job = await repo.get3dJob('a1');
    expect(job!.status, 'failed');
    expect(job.error, 'mesh failed');
  });

  testWidgets('re-entry with a persisted failed job shows Retry, no new job',
      (tester) async {
    final repo = FakeAssetRepository();
    await repo.saveAsset(makeAsset());
    await repo.save3dJob(
      assetId: 'a1',
      job: const PersistedAiJob(
          jobId: 'job-dead', status: 'failed', error: 'mesh failed'),
    );
    final api = _FakeApi();

    await tester.pumpWidget(harness(repo, api));
    await tester.pump();

    expect(api.startCalls, 0, reason: 'a failed job must not auto-restart');
    expect(find.text('mesh failed'), findsOneWidget);
    expect(find.text('Retry generation'), findsOneWidget);
  });

  testWidgets('fresh entry shows the generate button and makes no API calls',
      (tester) async {
    final repo = FakeAssetRepository();
    await repo.saveAsset(makeAsset());
    final api = _FakeApi();

    await tester.pumpWidget(harness(repo, api));
    await tester.pump();

    expect(api.startCalls, 0);
    expect(api.pollCalls, 0);
    expect(find.text('Generate 3D world'), findsOneWidget);
  });
}
