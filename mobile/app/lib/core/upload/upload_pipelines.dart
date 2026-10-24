part of 'upload_queue.dart';

/// The two job pipelines of [UploadQueue]: an asset's main panorama and an
/// extra room. Split from the queue file to keep both under the size limit.
///
/// Rules every create step follows:
/// - the id of what it created is persisted before anything else can throw;
/// - the step is entered only when that id is not already recorded;
/// - the create carries an `Idempotency-Key` derived from the asset or room id,
///   the same on every retry. The 2026-10 backend ignores it on tours and
///   scenes, so it protects nothing today: the persisted ids above (and the
///   scene lookup in [_sceneFor]) are the real guard.
extension _Pipelines on UploadQueue {
  // ---- Asset (main panorama) -------------------------------------------------

  Future<_Step> _advanceAsset(Map<String, dynamic> job, ScanAsset asset) async {
    try {
      _resetIfPresignStale(job);
      // A tour already exists — never POST /tours again. `resumeStep` holds
      // the same rule but only runs on enqueue/retry/auth-release, so a plain
      // backoff retry used to re-enter createTour and duplicate the tour.
      if (job['step'] == 'createTour' && job['tourId'] != null) {
        job['step'] = 'presign';
      }
      // A crash after the job stored the tour id but before the asset did must
      // not leave the asset without it (a later delete would orphan the tour).
      final jobTourId = job['tourId'] as String?;
      if (jobTourId != null && asset.remoteTourId == null) {
        await _saveIfAlive(asset.id, (c) => c.copyWith(remoteTourId: jobTourId));
      }
      // The main scene already exists — never upload the panorama or create a
      // scene again. A scene id on the job only (a build before the asset
      // stored it) is copied to the asset.
      final knownScene = asset.remoteSceneId ?? (job['sceneId'] as String?);
      if (knownScene != null) {
        job['sceneId'] = knownScene;
        if (asset.remoteSceneId == null) {
          await _saveIfAlive(
              asset.id, (c) => c.copyWith(remoteSceneId: knownScene));
        }
        if (stepsBeforeScene.contains(job['step'])) job['step'] = 'publish';
      }
      final ranUploadStep = await _advanceUpload(
        job,
        tourId: job['tourId'] as String?,
        panoramaPath: asset.panoramaPath,
        // StateError stays internal; the message IS the user-facing lastError
        // surfaced by the detail screen.
        missingFileMessage:
            'The panorama file is missing from this device (stitching '
            'did not complete). Delete this scan and re-capture it.',
        nextStep: 'createScene',
      );
      switch (ranUploadStep ? '' : job['step'] as String) {
        case 'createTour':
          final tour = await _api.createTour(
            title: asset.name,
            idempotencyKey: 'tour-${asset.id}',
          );
          // Persist the id before anything else can throw, so a later failure
          // still remembers the tour it already created.
          job['tourId'] = tour.id;
          await _store.upsert(UploadQueue._collection, job);
          await _saveIfAlive(asset.id, (c) => c.copyWith(remoteTourId: tour.id));
          job['step'] = 'presign';
        case 'createScene':
          final sceneId = await _sceneFor(
            job,
            tourId: job['tourId'] as String,
            imageUrl: job['panoramaUrl'] as String,
            title: asset.name,
            key: 'scene-${asset.id}',
          );
          job['sceneId'] = sceneId;
          await _store.upsert(UploadQueue._collection, job);
          await _saveIfAlive(asset.id, (c) => c.copyWith(remoteSceneId: sceneId));
          job['step'] = 'publish';
        case 'publish':
          final tour = await _api.publishTour(job['tourId'] as String);
          final needsCloudStitch = job['cloudStitch'] == true ||
              (asset.status == AssetStatus.pendingCloudStitch &&
                  asset.framePaths.isNotEmpty);
          job['cloudStitch'] = needsCloudStitch;
          final panoramaUrl = job['panoramaUrl'] as String?;
          final shareCode = tour.shortCode;
          // copyWith treats an explicit null as "reset", so only apply these
          // when produced — a transient null must not wipe an existing value.
          await _saveIfAlive(asset.id, (c) {
            var u = c.copyWith(
                status: needsCloudStitch
                    ? AssetStatus.pendingCloudStitch
                    : AssetStatus.ready);
            if (panoramaUrl != null) u = u.copyWith(panoramaUrl: panoramaUrl);
            if (shareCode != null) u = u.copyWith(shareCode: shareCode);
            return u;
          });
          if (needsCloudStitch) {
            job['frameIndex'] = 0;
            job['frameUrls'] = <String>[];
            job['missingFrames'] = 0;
            job['step'] = 'uploadFrames';
          } else {
            job['step'] = 'done';
          }
        // The local stitch was the naive fallback: ship the raw frames and
        // ask the backend to re-stitch with OpenCV (it replaces the scene
        // image when the job completes). One frame per pass, resumable.
        case 'uploadFrames':
          final i = job['frameIndex'] as int? ?? 0;
          final frames = asset.framePaths;
          job['frameUrls'] ??= <String>[];
          if (i >= frames.length) {
            job['step'] = 'requestStitch';
          } else {
            final file = File(frames[i]);
            if (file.existsSync()) {
              final presigned = await _api.createPresignedUpload(
                filename: 'frame_$i.jpg',
                folderType: StorageFolderType.tourOriginal,
                tourId: job['tourId'] as String,
                fileSize: file.lengthSync(),
              );
              await _api.uploadToCloudinary(presigned: presigned, file: file);
              await _api.confirmUpload(presigned.uploadId);
              (job['frameUrls'] as List).add(presigned.publicUrl);
            } else {
              // Frame vanished (deleted / never written): count it so the
              // cloud re-stitch step can warn instead of silently skipping.
              job['missingFrames'] = (job['missingFrames'] as int? ?? 0) + 1;
            }
            job['frameIndex'] = i + 1;
          }
        case 'requestStitch':
          final urls = List<String>.from(job['frameUrls'] as List? ?? []);
          final missing = job['missingFrames'] as int? ?? 0;
          if (urls.length >= 2 && missing == 0) {
            final started = await _api.requestCloudStitch(
              sceneId: job['sceneId'] as String,
              frameUrls: urls,
            );
            // The asset is NOT ready yet: the naive panorama stays until the
            // job reports back (awaitStitch).
            job['stitchJobId'] = started.job.id;
            job['stitchStartedAt'] = DateTime.now().millisecondsSinceEpoch;
            job['lastError'] = null;
            job['step'] = 'awaitStitch';
          } else if (missing > 0) {
            // Real frames were missing at upload time — never claim "ready"
            // with a silent quality loss; surface a re-capture warning.
            job['lastError'] =
                'Only ${urls.length} of ${asset.framePaths.length} frames '
                'uploaded — please re-capture';
            await _saveIfAlive(
                asset.id, (c) => c.copyWith(status: AssetStatus.failed));
            job['step'] = 'done';
          } else {
            // Too few frames to cloud re-stitch, but nothing was lost: the
            // naive pano stays and the asset is genuinely ready. Log the
            // skip reason for observability.
            job['lastError'] =
                'Cloud re-stitch skipped: fewer than 2 frames were captured';
            await _saveIfAlive(
                asset.id, (c) => c.copyWith(status: AssetStatus.ready));
            job['step'] = 'done';
          }
        case 'awaitStitch':
          if (!await _checkStitchJob(job, asset)) {
            await _store.upsert(UploadQueue._collection, job);
            Timer(UploadQueue.stitchPollInterval, pump);
            return _Step.errored; // a timer polls again; skip this pass
          }
      }
      job['attempts'] = 0;
      job.remove('nextRetryAt');
      job.remove('authHolds'); // a successful call proves the session is alive
      await _store.upsert(UploadQueue._collection, job);
      return _Step.progressed;
    } catch (e) {
      final gaveUp = await _failWithBackoff(
        job,
        e,
        onGiveUp: () => _saveIfAlive(
            asset.id, (c) => c.copyWith(status: AssetStatus.failed)),
      );
      return gaveUp ? _Step.progressed : _Step.errored;
    }
  }

  /// Reads the cloud stitch job and sets the asset from its outcome: ready
  /// when it completed, failed when it failed or was cancelled. Returns false
  /// while the job is still running (pending, processing, or a status this
  /// build does not know). After [UploadQueue.stitchTimeout] a job that never
  /// finished is reported as failed.
  Future<bool> _checkStitchJob(
      Map<String, dynamic> job, ScanAsset asset) async {
    final snapshot = await _api.getAiJob(job['stitchJobId'] as String);
    switch (snapshot.job.status) {
      case AIJobStatus.completed:
        await _saveIfAlive(
            asset.id, (c) => c.copyWith(status: AssetStatus.ready));
        job['lastError'] = null;
      case AIJobStatus.failed || AIJobStatus.cancelled:
        final reason = snapshot.job.errorMessage ??
            (snapshot.job.status == AIJobStatus.cancelled
                ? 'The job was cancelled.'
                : 'The server could not stitch the frames.');
        job['lastError'] = 'Cloud stitch failed: $reason';
        await _saveIfAlive(
            asset.id, (c) => c.copyWith(status: AssetStatus.failed));
      case AIJobStatus.pending || AIJobStatus.processing || null:
        final started = job['stitchStartedAt'] as int? ??
            DateTime.now().millisecondsSinceEpoch;
        final waited = DateTime.now().millisecondsSinceEpoch - started;
        if (waited < UploadQueue.stitchTimeout.inMilliseconds) return false;
        job['lastError'] =
            'Cloud stitch did not finish in time. Retry to ask again.';
        await _saveIfAlive(
            asset.id, (c) => c.copyWith(status: AssetStatus.failed));
    }
    job['step'] = 'done';
    return true;
  }

  // ---- Room (extra scene) ----------------------------------------------------

  /// Room (additional scene) pipeline: presign → put → confirm → createScene.
  Future<_Step> _advanceRoom(Map<String, dynamic> job, ScanAsset asset) async {
    final getRooms = _getRooms;
    final saveRoom = _saveRoom;
    final tourId = asset.remoteTourId;
    if (getRooms == null || saveRoom == null || tourId == null) {
      // Tour not created yet — wait for the asset job to finish first.
      return _Step.idle;
    }
    // The server orders scenes by creation (the client sends no order_index),
    // so the main scene must be created before any room scene.
    if (asset.remoteSceneId == null && await _mainSceneInFlight(asset.id)) {
      return _Step.idle;
    }
    final rooms = await getRooms(asset.id);
    final room = rooms.where((r) => r.id == job['roomId']).firstOrNull;
    if (room == null) {
      job['step'] = 'done';
      await _store.upsert(UploadQueue._collection, job);
      return _Step.progressed;
    }
    // The room may be deleted while a step awaits the network; saving the
    // earlier snapshot afterwards would bring it back.
    Future<void> saveRoomIfAlive(Room updated) async {
      final alive = (await getRooms(asset.id)).any((r) => r.id == room.id);
      if (alive) await saveRoom(updated);
    }

    try {
      _resetIfPresignStale(job);
      final ranUploadStep = await _advanceUpload(
        job,
        tourId: tourId,
        panoramaPath: room.panoramaPath,
        missingFileMessage:
            'The room panorama is missing from this device (stitching '
            'did not complete). Delete this room and re-capture it.',
        nextStep: 'createScene',
      );
      switch (ranUploadStep ? '' : job['step'] as String) {
        case 'createScene':
          final sceneId = await _sceneFor(
            job,
            tourId: tourId,
            imageUrl: job['panoramaUrl'] as String,
            title: room.name,
            key: 'scene-room-${room.id}',
          );
          job['sceneId'] = sceneId;
          await _store.upsert(UploadQueue._collection, job);
          await saveRoomIfAlive(room.copyWith(
            remoteSceneId: sceneId,
            panoramaUrl: job['panoramaUrl'] as String?,
            status: 'ready',
          ));
          job['step'] = 'done';
      }
      job['attempts'] = 0;
      job.remove('nextRetryAt');
      job.remove('authHolds'); // a successful call proves the session is alive
      await _store.upsert(UploadQueue._collection, job);
      return _Step.progressed;
    } catch (e) {
      final gaveUp = await _failWithBackoff(
        job,
        e,
        // Terminal failure must surface on the room, not leave it stuck at
        // "Uploading…" forever (focus g).
        onGiveUp: () async {
          await saveRoomIfAlive(room.copyWith(
            status: 'failed',
            lastError: describeError(e),
          ));
        },
      );
      return gaveUp ? _Step.progressed : _Step.errored;
    }
  }

  /// True while the asset's own job has not finished: its main scene may not
  /// exist yet.
  Future<bool> _mainSceneInFlight(String assetId) async {
    final jobs = await _store.readAll(UploadQueue._collection);
    return jobs.any((j) =>
        j['assetId'] == assetId &&
        j['kind'] != 'room' &&
        j['step'] != 'done');
  }

  // ---- Shared ------------------------------------------------------------------

  /// The scene id for a job: the one already recorded, else one found on the
  /// tour, else a new one.
  ///
  /// After a create was sent, a retry may follow a lost response. The server
  /// does not deduplicate scene creates yet (it ignores `Idempotency-Key` on
  /// this route), so the retry first looks for a scene on the tour that already
  /// holds this image, and creates another only when there is none.
  Future<String> _sceneFor(
    Map<String, dynamic> job, {
    required String tourId,
    required String imageUrl,
    required String title,
    required String key,
  }) async {
    final known = job['sceneId'] as String?;
    if (known != null) return known;
    if (job['sceneRequested'] == true) {
      final detail = await _api.getTour(tourId);
      final found = detail.scenes.where((s) => s.imageUrl == imageUrl).firstOrNull;
      if (found != null) return found.id;
    }
    job['sceneRequested'] = true;
    await _store.upsert(UploadQueue._collection, job);
    final scene = await _api.createScene(
      tourId: tourId,
      imageUrl: imageUrl,
      title: title,
      idempotencyKey: key,
    );
    return scene.id;
  }

  /// The stored presign, or null when it cannot be read (a job saved by an
  /// older build). The caller signs again.
  PresignedUploadDto? _storedPresign(Map<String, dynamic> job) {
    try {
      return PresignedUploadDto.fromJson(asJsonMap(job['presigned'], 'presign'));
    } on FormatException {
      return null;
    }
  }

  /// The `presign → putCloudinary → confirm` segment, identical for an asset's
  /// panorama and a room's. Advances [job] one step; returns false when the
  /// current step belongs to the caller's own switch.
  Future<bool> _advanceUpload(
    Map<String, dynamic> job, {
    required String? tourId,
    required String? panoramaPath,
    required String missingFileMessage,
    required String nextStep,
  }) async {
    switch (job['step'] as String) {
      case 'presign':
        if (panoramaPath == null || !File(panoramaPath).existsSync()) {
          throw StateError(missingFileMessage);
        }
        if (tourId == null) {
          throw StateError('The tour for this upload no longer exists.');
        }
        final presigned = await _api.createPresignedUpload(
          filename: 'panorama.jpg',
          folderType: StorageFolderType.tourOriginal,
          tourId: tourId,
          fileSize: File(panoramaPath).lengthSync(),
        );
        job['presigned'] = presigned.toJson();
        job['presignedAt'] = DateTime.now().millisecondsSinceEpoch;
        job['step'] = 'putCloudinary';
        return true;
      case 'putCloudinary':
        // The file can vanish between steps (storage sweep, user deletion);
        // surface the same readable reason as presign rather than a TypeError.
        if (panoramaPath == null || !File(panoramaPath).existsSync()) {
          throw StateError(missingFileMessage);
        }
        final presigned = _storedPresign(job);
        if (presigned == null) {
          job['step'] = 'presign';
          job.remove('presigned');
          return true;
        }
        await _api.uploadToCloudinary(
          presigned: presigned,
          file: File(panoramaPath),
        );
        job['step'] = 'confirm';
        return true;
      case 'confirm':
        final presigned = _storedPresign(job);
        if (presigned == null) {
          job['step'] = 'presign';
          job.remove('presigned');
          return true;
        }
        final confirmed = await _api.confirmUpload(presigned.uploadId);
        if (confirmed.uploadStatus == UploadStatus.failed) {
          throw StateError('The server rejected the uploaded file.');
        }
        // Fail closed: only a complete upload may become a scene image. Any
        // other status (pending, or one this build does not know) is retried.
        if (confirmed.uploadStatus != UploadStatus.complete) {
          throw StateError('The server has not finished processing the upload.');
        }
        job['panoramaUrl'] = presigned.publicUrl;
        job['step'] = nextStep;
        return true;
    }
    return false;
  }
}
