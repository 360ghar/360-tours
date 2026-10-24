import '../../../core/api/api_exception.dart';
import '../../../core/api/backend_api.dart';
import '../../../core/models/models.dart';
import '../../../core/repositories/repositories.dart';

/// User-facing failure when publishing a tour (minting its share link) fails.
/// The server's message (from the error envelope) is shown; raw Dio/network
/// text never is.
class SharePublishException implements Exception {
  SharePublishException(this.message, [this.cause]);

  final String message;
  final Object? cause;

  @override
  String toString() => message;
}

/// Share links via the backend: publishing a tour mints a short_code served
/// at {API_ROOT}/v/{code} (an OG page that redirects to the web viewer).
class ApiShareRepository implements ShareRepository {
  ApiShareRepository(
    this._api, {
    required this._saveAsset,
  });

  final BackendApi _api;
  final Future<void> Function(ScanAsset asset) _saveAsset;

  @override
  Future<ShareLink> createLink(ScanAsset asset) async {
    final tourId = asset.remoteTourId;
    if (tourId == null) {
      throw StateError('Asset is not uploaded yet');
    }
    var code = asset.shareCode;
    if (code == null) {
      try {
        code = (await _api.publishTour(tourId)).shortCode;
      } catch (e) {
        throw SharePublishException(
          e is ApiException && !e.isNetwork
              ? 'Could not publish the tour: ${e.userMessage}'
              : 'Could not publish the tour. Check your connection and try '
                  'again.',
          e,
        );
      }
      // Publish always mints a short code. Without one there is no link to
      // give: an error, not an empty link.
      if (code == null) {
        throw SharePublishException(
            'The server published the tour but sent no share link. Try again.');
      }
      await _saveAsset(asset.copyWith(shareCode: code));
    }
    return ShareLink(
      code: code,
      assetId: asset.id,
      createdAt: DateTime.now(),
    );
  }

  @override
  Future<ShareLink?> getLink(String code) async =>
      null; // ponytail: reverse lookup unused in-app; links open in browser

  @override
  Future<ViewAnalytics> getAnalytics(String tourId) async {
    final data = await _api.getAnalytics(tourId);
    return ViewAnalytics(
      tourId: tourId,
      views: data.totalViews,
      totalSeconds: data.sessionDurations.fold<double>(0, (a, b) => a + b).round(),
      hotspotClicks: data.hotspotClicks.values.fold<int>(0, (a, b) => a + b),
    );
  }
}
