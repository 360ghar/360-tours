import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';

/// A fixture group written by tool/api_fixtures.py from the backend's own
/// Pydantic response models.
Map<String, dynamic> fixture(String group) =>
    jsonDecode(File('test/fixtures/api/$group.json').readAsStringSync())
        as Map<String, dynamic>;

Map<String, dynamic> obj(Object? value) =>
    Map<String, dynamic>.from(value! as Map);

/// Dio adapter that records requests and answers from a callback.
class FakeAdapter implements HttpClientAdapter {
  FakeAdapter(this._respond);

  final ResponseBody Function(RequestOptions options) _respond;
  final requests = <RequestOptions>[];

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    requests.add(options);
    return _respond(options);
  }

  @override
  void close({bool force = false}) {}
}

ResponseBody jsonBody(
  Object? body, {
  int status = 200,
  Map<String, List<String>>? headers,
}) =>
    ResponseBody.fromString(
      jsonEncode(body),
      status,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
        ...?headers,
      },
    );

Dio dioWith(FakeAdapter adapter) => Dio(BaseOptions(
      baseUrl: 'https://api.test/api/v1',
    ))
      ..httpClientAdapter = adapter;

/// Fails when [body] holds a key the OpenAPI request schema does not declare,
/// or leaves out a key it requires. The backend answers 422 to both.
void expectDeclaredKeys(
  Map<String, dynamic> schemas,
  String schema,
  Map<String, dynamic> body,
) {
  final declared = obj(schemas[schema]);
  expect(declared['additionalProperties'], false,
      reason: '$schema rejects unknown keys');
  expect((declared['properties'] as Map).keys, containsAll(body.keys),
      reason: '$schema got $body');
  // The backend answers 422 to a body that leaves out a required key.
  expect(body.keys, containsAll((declared['required'] as List?) ?? const []),
      reason: '$schema needs its required keys, got $body');
}
