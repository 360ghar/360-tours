import 'dart:convert';

import 'package:dio/dio.dart';

/// One entry of `error.details.fields` on a 422 body.
class ApiFieldError {
  const ApiFieldError({
    required this.field,
    required this.msg,
    required this.type,
  });

  /// Source and path, for example `body.title` or `query.limit`.
  final String field;
  final String msg;
  final String type;
}

/// A failed backend call, parsed from the error envelope
/// `{"error": {"code", "message", "details"}}`. Nothing else is read: the
/// legacy `{"detail": ...}` shape is gone from the backend.
///
/// `BackendApi` throws this for every failed call, so no raw Dio text reaches
/// the UI or the stored `lastError` of a queue job.
class ApiException implements Exception {
  const ApiException({
    this.statusCode,
    this.code,
    required this.message,
    this.fields = const [],
    this.retryAfter,
    this.fromStorage = false,
    this.isNetwork = false,
  });

  /// HTTP status. Null when no response arrived (timeout, no connection).
  final int? statusCode;

  /// Stable machine code from the envelope, for example `NOT_FOUND`. Branch on
  /// this, never on [message].
  final String? code;
  final String message;

  /// Field errors of a 422 (`details.fields`). Empty on other statuses.
  final List<ApiFieldError> fields;

  /// Wait requested by the server (`Retry-After`, seconds) on 429 and 503.
  final Duration? retryAfter;

  /// The failure came from the Cloudinary host, not from the 360ghar API. A 401
  /// there means a rejected upload signature, not an expired session.
  final bool fromStorage;

  /// No response arrived.
  final bool isNetwork;

  factory ApiException.fromDio(DioException e, {bool fromStorage = false}) {
    final res = e.response;
    if (res == null) {
      return ApiException(
        message: _transportMessage(e),
        isNetwork: true,
        fromStorage: fromStorage,
      );
    }
    final body = _decodeBody(res.data);
    String? code;
    String? message;
    var fields = const <ApiFieldError>[];
    if (body is Map && body['error'] is Map) {
      final err = body['error'] as Map;
      if (err['code'] is String) code = err['code'] as String;
      if (err['message'] is String) message = err['message'] as String;
      final details = err['details'];
      if (details is Map && details['fields'] is List) {
        fields = [
          for (final f in details['fields'] as List)
            if (f is Map)
              ApiFieldError(
                field: '${f['field'] ?? ''}',
                msg: '${f['msg'] ?? ''}',
                type: '${f['type'] ?? ''}',
              ),
        ];
      }
    }
    return ApiException(
      statusCode: res.statusCode,
      code: code,
      message: message ??
          'The server returned an error (HTTP ${res.statusCode ?? 'unknown'}).',
      fields: fields,
      retryAfter: _retryAfter(res.headers),
      fromStorage: fromStorage,
    );
  }

  /// A 2xx body that does not match the contract.
  factory ApiException.badResponse(int? statusCode, String detail) =>
      ApiException(
        statusCode: statusCode,
        code: 'BAD_RESPONSE',
        message: 'The server sent an unexpected response ($detail).',
      );

  /// Text for the user. A 422 lists the fields the server rejected.
  String get userMessage {
    if (fields.isEmpty) return message;
    return fields.take(3).map((f) {
      final name = f.field.replaceFirst(RegExp(r'^(body|query|path)\.?'), '');
      return name.isEmpty ? f.msg : '$name: ${f.msg}';
    }).join('; ');
  }

  @override
  String toString() => userMessage;

  static Object? _decodeBody(Object? data) {
    try {
      if (data is List<int>) return jsonDecode(utf8.decode(data));
      if (data is String) return jsonDecode(data);
    } catch (_) {
      return null;
    }
    return data;
  }

  static Duration? _retryAfter(Headers headers) {
    final seconds = int.tryParse(headers.value('retry-after') ?? '');
    return seconds == null || seconds < 0 ? null : Duration(seconds: seconds);
  }

  static String _transportMessage(DioException e) => switch (e.type) {
        DioExceptionType.badCertificate =>
          'A secure connection to the server could not be made.',
        DioExceptionType.cancel => 'The request was cancelled.',
        _ => 'Could not reach the server. Check your connection and try again.',
      };
}

/// Readable text for any error a queue job or screen can see. Never raw Dio
/// output.
String describeError(Object e) => switch (e) {
      ApiException() => e.userMessage,
      DioException() => ApiException.fromDio(e).userMessage,
      StateError() => e.message,
      _ => e.toString(),
    };
