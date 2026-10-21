import 'package:flutter_test/flutter_test.dart';
import 'package:tours360/core/api/api_exception.dart';
import 'package:tours360/core/models/api_dtos.dart';
import 'package:tours360/core/models/models.dart';
import 'package:tours360/core/models/wire_enums.dart';
import 'package:tours360/features/share/data/api_share_repository.dart';

import 'fakes.dart';

class _ShareApi extends FakeBackendApi {
  Object? publishError;
  String? shortCode = 'abc12';
  TourAnalyticsDto analytics = const TourAnalyticsDto(
    tourId: 'tour-1',
    totalViews: 41,
    sessionDurations: [30.0, 75.5, 52.0],
    hotspotClicks: {'h-1': 6, 'h-2': 4},
  );

  @override
  Future<TourDto> publishTour(String tourId) async {
    final error = publishError;
    if (error != null) throw error;
    calls.add('publish:$tourId');
    return TourDto(
      id: tourId,
      title: 't',
      status: TourStatus.published,
      visibility: TourVisibility.unlisted,
      shortCode: shortCode,
    );
  }

  @override
  Future<TourAnalyticsDto> getAnalytics(String tourId) async => analytics;
}

void main() {
  late _ShareApi api;
  late List<ScanAsset> saved;
  late ApiShareRepository repo;

  ScanAsset asset({String? code}) => ScanAsset(
        id: 'a1',
        ownerId: 'u1',
        name: 'Living room',
        createdAt: DateTime(2026),
        remoteTourId: 'tour-1',
        shareCode: code,
      );

  setUp(() {
    api = _ShareApi();
    saved = [];
    repo = ApiShareRepository(api, saveAsset: (a) async => saved.add(a));
  });

  group('createLink', () {
    test('publishes, stores the code and builds the /v/ link from it',
        () async {
      final link = await repo.createLink(asset());
      expect(link.code, 'abc12');
      expect(link.url, 'https://api.360ghar.com/v/abc12');
      expect(saved.single.shareCode, 'abc12');
    });

    test('an asset that already has a code does not publish again', () async {
      final link = await repo.createLink(asset(code: 'kept1'));
      expect(link.code, 'kept1');
      expect(api.calls, isEmpty);
    });

    test('a publish with no short code is an error, never an empty link',
        () async {
      api.shortCode = null;
      await expectLater(
        repo.createLink(asset()),
        throwsA(isA<SharePublishException>()),
      );
      expect(saved, isEmpty);
    });

    test('a server refusal shows the server message', () async {
      api.publishError = const ApiException(
          statusCode: 404, code: 'NOT_FOUND', message: 'Tour not found');
      await expectLater(
        repo.createLink(asset()),
        throwsA(isA<SharePublishException>()
            .having((e) => e.message, 'message', contains('Tour not found'))),
      );
    });

    test('a connection failure shows the connection message', () async {
      api.publishError =
          const ApiException(message: 'offline', isNetwork: true);
      await expectLater(
        repo.createLink(asset()),
        throwsA(isA<SharePublishException>().having(
            (e) => e.message, 'message', contains('Check your connection'))),
      );
    });
  });

  test('analytics: views, total seconds, and hotspot clicks (not showings)',
      () async {
    final a = await repo.getAnalytics('tour-1');
    expect(a.tourId, 'tour-1');
    expect(a.views, 41);
    expect(a.totalSeconds, 158); // 30 + 75.5 + 52 = 157.5, rounded
    expect(a.hotspotClicks, 10);
  });
}
