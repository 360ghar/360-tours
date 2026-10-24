import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tours360/core/api/backend_api.dart';
import 'package:tours360/core/models/api_dtos.dart';

void main() {
  const presigned = PresignedUploadDto(
    uploadId: 'up-1',
    signedUrl: 'https://cloudinary.example/upload',
    signature: 'sig-1',
    apiKey: 'key-1',
    timestamp: 1700000000,
    publicId: 'pid-1',
    path: 'p',
    publicUrl: 'https://res.example/p.jpg',
  );

  test('signedUploadFields reads the backend signature key, not token', () {
    final fields = BackendApi(Dio()).signedUploadFields(presigned);

    expect(fields, {
      'api_key': 'key-1',
      'signature': 'sig-1',
      'timestamp': 1700000000,
      'public_id': 'pid-1',
    });
  });

  test('type is sent only when the backend returns it (the signature covers it)',
      () {
    final withType = PresignedUploadDto.fromJson({
      ...presigned.toJson(),
      'type': 'authenticated',
    });
    expect(BackendApi(Dio()).signedUploadFields(withType)['type'],
        'authenticated');
    expect(BackendApi(Dio()).signedUploadFields(presigned),
        isNot(contains('type')));
  });

  test('a presign with a missing field fails at parse, not at Cloudinary', () {
    final json = presigned.toJson()..remove('signature');
    expect(() => PresignedUploadDto.fromJson(json), throwsFormatException);
  });
}
