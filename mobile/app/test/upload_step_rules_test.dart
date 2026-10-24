import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tours360/core/api/api_exception.dart';
import 'package:tours360/core/upload/upload_step_rules.dart';

void main() {
  rulesAddedInPassA();
  group('resumeStep', () {
    test('an asset job with no recorded step starts at createTour', () {
      expect(resumeStep({'kind': 'asset'}), 'createTour');
    });

    test('a room job with no recorded step starts at presign', () {
      expect(resumeStep({'kind': 'room'}), 'presign');
    });

    // The duplicate-tour guard: a job that already created its tour must never
    // re-enter createTour, whatever step it stalled on.
    test('never returns createTour once a tourId exists', () {
      expect(
        resumeStep({'kind': 'asset', 'lastStep': 'createTour', 'tourId': 't1'}),
        'presign',
      );
    });

    test('rewinds to presign and drops a stored signature', () {
      final job = {
        'kind': 'asset',
        'lastStep': 'putCloudinary',
        'presigned': {'upload_id': 'u1'},
        'presignedAt': 123,
      };
      expect(resumeStep(job), 'presign');
      expect(job.containsKey('presigned'), isFalse);
      expect(job.containsKey('presignedAt'), isFalse);
    });

    test('later steps resume where they stalled', () {
      expect(resumeStep({'kind': 'asset', 'lastStep': 'publish'}), 'publish');
      expect(
        resumeStep({'kind': 'room', 'lastStep': 'createScene'}),
        'createScene',
      );
    });
  });

  group('presignStale', () {
    test('is stale when no timestamp was persisted', () {
      expect(presignStale({}), isTrue);
      expect(presignStale({'presignedAt': 'not-an-int'}), isTrue);
    });

    test('is fresh just after signing and stale past the max age', () {
      final now = DateTime.now();
      expect(presignStale({'presignedAt': now.millisecondsSinceEpoch}), isFalse);
      final old = now.subtract(presignMaxAge).subtract(const Duration(minutes: 1));
      expect(presignStale({'presignedAt': old.millisecondsSinceEpoch}), isTrue);
    });
  });

  group('isAuthExpired', () {
    Response<dynamic> response(int code) => Response(
          requestOptions: RequestOptions(path: '/x'),
          statusCode: code,
        );

    test('only a typed Dio 401 counts', () {
      expect(
        isAuthExpired(DioException(
          requestOptions: RequestOptions(path: '/x'),
          response: response(401),
        )),
        isTrue,
      );
      expect(
        isAuthExpired(DioException(
          requestOptions: RequestOptions(path: '/x'),
          response: response(500),
        )),
        isFalse,
      );
      // A transport failure with no response must not read as auth expiry.
      expect(
        isAuthExpired(DioException(requestOptions: RequestOptions(path: '/x'))),
        isFalse,
      );
      // Nor may a message that merely mentions 401.
      expect(isAuthExpired(StateError('status code of 401')), isFalse);
    });
  });
}

void rulesAddedInPassA() {
  group('resumeStep with a scene id', () {
    test('never re-enters upload or createScene once a scene exists', () {
      for (final step in [
        'createTour',
        'presign',
        'putCloudinary',
        'confirm',
        'createScene',
      ]) {
        expect(
          resumeStep({
            'kind': 'asset',
            'lastStep': step,
            'tourId': 't1',
            'sceneId': 's1',
          }),
          'publish',
          reason: step,
        );
      }
    });

    test('a room with a scene id resumes at createScene to record it', () {
      expect(
        resumeStep({'kind': 'room', 'lastStep': 'presign', 'sceneId': 's1'}),
        'createScene',
      );
    });

    test('later steps are untouched', () {
      expect(
        resumeStep({'kind': 'asset', 'lastStep': 'uploadFrames', 'sceneId': 's'}),
        'uploadFrames',
      );
      expect(
        resumeStep({'kind': 'asset', 'lastStep': 'awaitStitch', 'sceneId': 's'}),
        'awaitStitch',
      );
    });
  });

  group('failureAction', () {
    ApiException status(int code, {bool fromStorage = false}) => ApiException(
        statusCode: code, message: 'x', fromStorage: fromStorage);

    test('401 from the API holds the job for sign-in', () {
      expect(failureAction(status(401)), FailureAction.holdForAuth);
      expect(isAuthExpired(status(401)), isTrue);
    });

    test('401 from Cloudinary signs again; it is not an expired session', () {
      final e = status(401, fromStorage: true);
      expect(failureAction(e), FailureAction.retryFromPresign);
      expect(isAuthExpired(e), isFalse);
    });

    test('4xx other than 408 and 429 is terminal', () {
      for (final code in [400, 403, 404, 409, 413, 422]) {
        expect(failureAction(status(code)), FailureAction.fail, reason: '$code');
      }
    });

    test('408, 429, 5xx and no response are retried', () {
      for (final code in [408, 429, 500, 502, 503]) {
        expect(failureAction(status(code)), FailureAction.retry,
            reason: '$code');
      }
      expect(failureAction(const ApiException(message: 'x', isNetwork: true)),
          FailureAction.retry);
      expect(failureAction(StateError('file missing')), FailureAction.retry);
    });

    test('a raw DioException still classifies by its status', () {
      DioException dio(int code) => DioException(
            requestOptions: RequestOptions(path: '/x'),
            response: Response(
                requestOptions: RequestOptions(path: '/x'), statusCode: code),
          );
      expect(failureAction(dio(401)), FailureAction.holdForAuth);
      expect(failureAction(dio(422)), FailureAction.fail);
      expect(failureAction(dio(500)), FailureAction.retry);
    });

    test('Retry-After is read from the exception', () {
      expect(
        serverRetryAfter(const ApiException(
            message: 'x', retryAfter: Duration(seconds: 30))),
        const Duration(seconds: 30),
      );
      expect(serverRetryAfter(StateError('x')), isNull);
    });
  });
}
