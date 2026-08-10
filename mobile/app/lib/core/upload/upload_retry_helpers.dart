// Shared, dependency-free helpers for the upload pipeline (kept in their own
// file so the queue and step-runner files respect ARCHITECTURE.md size
// limits).

import 'package:dio/dio.dart';

/// Human/actionable error description. HTTP status + backend `detail` for
/// API failures; the raw message otherwise. Never includes auth headers.
String describeUploadError(Object e) {
  if (e is DioException) {
    final code = e.response?.statusCode;
    final data = e.response?.data;
    if (data is Map && data['detail'] is String) {
      final detail = data['detail'] as String;
      return 'HTTP $code: ${detail.length > 300 ? detail.substring(0, 300) : detail}';
    }
    return code == null ? e.message ?? e.toString() : 'HTTP $code';
  }
  return e.toString();
}

/// 4xx that must never be retried. 408 (timeout) and 429 (rate limit) are
/// transient. 401 is retried exactly once by the api_client interceptor;
/// a second 401 means the session is really dead and the user must
/// re-sign-in — stop retrying.
bool isPermanent4xx(Object e) {
  if (e is! DioException) return false;
  final code = e.response?.statusCode;
  return code != null &&
      code >= 400 &&
      code < 500 &&
      code != 408 &&
      code != 429;
}

/// Computes the step a failed job should resume from. Never restarts before
/// `presign` once a tour already exists (duplicate-tour risk), and
/// re-presigns when the stored Cloudinary signature is likely expired.
String resumeStepFor(Map<String, dynamic> job) {
  // Cloud refinement is optional: a failed/abandoned stitch job re-requests
  // a fresh stitch (frames stay uploaded; the local panorama is live).
  if (job['step'] == 'stitchFailed') {
    // If frame upload was incomplete (or never started), finish uploading
    // the missing frames first — already-uploaded frames are skipped via
    // frameUrlsByIndex, so nothing is re-uploaded.
    final uploaded = Map<String, dynamic>.from(
      job['frameUrlsByIndex'] as Map? ?? {},
    );
    final total = job['framesTotal'] as int?;
    if (total != null && uploaded.length < total) {
      job['frameIndex'] = nextMissingIndex(uploaded, total);
      return 'uploadFrames';
    }
    job.remove('stitchJobId');
    job.remove('pollCount');
    return 'requestStitch';
  }
  if (job['stitchJobId'] != null) {
    job.remove('stitchJobId');
    job.remove('pollCount');
    return 'requestStitch';
  }
  final defaultStep = job['kind'] == 'room' ? 'presign' : 'createTour';
  var step = (job['lastStep'] as String?) ?? defaultStep;
  // A tour already exists — don't recreate it.
  if (step == 'createTour' && job['tourId'] != null) step = 'presign';
  // Upload already confirmed (crash between confirm and createScene): the
  // file is on Cloudinary — resume at createScene, never re-upload.
  if (step == 'confirm' || step == 'createScene') {
    if (job['panoramaUrl'] != null) return 'createScene';
  }
  // The stored Cloudinary signature/timestamp is likely expired by now.
  if (step == 'putCloudinary' || step == 'confirm') {
    step = 'presign';
    job.remove('presigned');
  }
  // Frame upload resumes from the persisted per-index map (skips uploaded).
  if (step == 'uploadFrames') {
    final uploaded = Map<String, dynamic>.from(
      job['frameUrlsByIndex'] as Map? ?? {},
    );
    job['frameIndex'] = nextMissingIndex(
      uploaded,
      job['framesTotal'] as int? ?? 0,
    );
  }
  return step;
}

/// First frame index not yet in [uploaded] (keys are original frame
/// indices); [total] when everything is uploaded.
int nextMissingIndex(Map<String, dynamic> uploaded, int total) {
  for (var k = 0; k < total; k++) {
    if (!uploaded.containsKey('$k')) return k;
  }
  return total;
}
