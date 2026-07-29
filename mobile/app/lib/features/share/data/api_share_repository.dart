import '../../../core/api/backend_api.dart';
import '../../../core/env.dart';
import '../../../core/models/models.dart';
import '../../../core/repositories/repositories.dart';

/// User-facing failure when publishing a tour (minting its share link) fails.
/// Raw Dio/network errors are caught and rethrown as this so the UI can show a
/// friendly message instead of leaking transport details.
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
    String? overrideUrl;
    if (code == null) {
      final Map<String, dynamic> tour;
      try {
        tour = await _api.publishTour(tourId);
      } catch (e) {
        throw SharePublishException(
          'Could not publish the tour. Check your connection and try again.',
          e,
        );
      }
      code = tour['short_code'] as String?;
      if (code != null) {
        await _saveAsset(asset.copyWith(shareCode: code));
      } else {
        // Older backend without short links: open the viewer directly.
        overrideUrl = '${Env.viewerBase}/view/$tourId';
        code = '';
      }
    }
    return ShareLink(
      code: code,
      assetId: asset.id,
      createdAt: DateTime.now(),
      overrideUrl: overrideUrl,
    );
  }

  @override
  Future<ShareLink?> getLink(String code) async =>
      null; // ponytail: reverse lookup unused in-app; links open in browser

  @override
  Future<ViewAnalytics> getAnalytics(String assetId) async {
    // assetId here must be the remote tour id (callers pass it through).
    final data = await _api.getAnalytics(assetId);
    final views = (data['total_views'] as num?)?.toInt() ?? 0;
    final durations = (data['session_durations'] as List?) ?? const [];
    var totalSeconds = 0.0;
    for (final d in durations) {
      if (d is num) totalSeconds += d.toDouble();
    }
    final clicks = (data['hotspot_clicks'] as Map?) ?? const {};
    var showingRequests = 0;
    for (final v in clicks.values) {
      if (v is num) showingRequests += v.toInt();
    }

    return ViewAnalytics(
      assetId: assetId,
      views: views,
      totalSeconds: totalSeconds.round(),
      showingRequests: showingRequests,
    );
  }
}
