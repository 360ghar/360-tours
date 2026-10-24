/// Pure step arithmetic for the upload queue. No I/O, no state — just the rules
/// that decide where a persisted job resumes from and how a failure is
/// classified, so they can be reasoned about (and tested) on their own.
library;

import 'package:dio/dio.dart';

import '../api/api_exception.dart';

/// Cloudinary presigned signatures are valid for ~1h; re-sign when the stored
/// one is older than this (crash-restart / long backoff resume).
const presignMaxAge = Duration(minutes: 55);

/// Steps that run before the main scene exists. A job holding a scene id never
/// re-enters them: the panorama is uploaded and the scene is created.
const stepsBeforeScene = {
  'createTour',
  'presign',
  'putCloudinary',
  'confirm',
  'createScene',
};

/// True when the stored Cloudinary signature is missing or likely expired.
bool presignStale(Map<String, dynamic> job) {
  final at = job['presignedAt'];
  if (at is! int) return true; // absent → stale
  return DateTime.now()
          .difference(DateTime.fromMillisecondsSinceEpoch(at))
          .compareTo(presignMaxAge) >
      0;
}

/// Computes the step a stalled job should resume from. Never restarts before
/// `presign` once a tour already exists (duplicate-tour risk), never re-enters
/// the upload or scene steps once a scene id is recorded (duplicate-scene
/// risk), and re-presigns when the stored Cloudinary signature is likely
/// expired.
String resumeStep(Map<String, dynamic> job) {
  final defaultStep = job['kind'] == 'room' ? 'presign' : 'createTour';
  var step = (job['lastStep'] as String?) ?? defaultStep;
  // A tour already exists — don't recreate it.
  if (step == 'createTour' && job['tourId'] != null) step = 'presign';
  // The scene already exists — don't upload or create it again.
  if (job['sceneId'] != null && stepsBeforeScene.contains(step)) {
    step = job['kind'] == 'room' ? 'createScene' : 'publish';
  }
  // The stored Cloudinary signature/timestamp is likely expired by now.
  if (step == 'putCloudinary' || step == 'confirm') {
    step = 'presign';
    job.remove('presigned');
    job.remove('presignedAt');
  }
  return step;
}

/// HTTP status of a failed call, or null when there is none.
int? _statusOf(Object e) => switch (e) {
      ApiException() => e.statusCode,
      DioException() => e.response?.statusCode,
      _ => null,
    };

/// True when [e] is a 401 from the 360ghar API — i.e. the client's single
/// refresh already failed and the session can no longer be repaired from inside
/// the queue.
///
/// Typed check only: string-matching `e.toString()` was brittle across Dio
/// versions/error shapes. A 401 from Cloudinary is not session expiry: it means
/// the upload signature was rejected (see [failureAction]).
bool isAuthExpired(Object e) {
  if (e is ApiException && e.fromStorage) return false;
  return _statusOf(e) == 401;
}

/// What the queue does with a failed step.
enum FailureAction {
  /// Session expired: park the job, burn no attempt.
  holdForAuth,

  /// The request can never succeed as sent (a 4xx other than 408 and 429):
  /// fail the job now.
  fail,

  /// Cloudinary rejected the signature: sign again, then retry.
  retryFromPresign,

  /// Transient: retry with backoff.
  retry,
}

FailureAction failureAction(Object e) {
  if (e is ApiException && e.fromStorage && e.statusCode == 401) {
    return FailureAction.retryFromPresign;
  }
  if (isAuthExpired(e)) return FailureAction.holdForAuth;
  final status = _statusOf(e);
  if (status != null && status >= 400 && status < 500) {
    if (status == 408 || status == 429) return FailureAction.retry;
    return FailureAction.fail;
  }
  return FailureAction.retry;
}

/// Wait the server asked for with `Retry-After` (429 and 503), if any.
Duration? serverRetryAfter(Object e) => e is ApiException ? e.retryAfter : null;
