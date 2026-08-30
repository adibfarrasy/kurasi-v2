import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kurasi/core/api/api_client.dart';
import 'package:kurasi/core/api/api_exception.dart';

class _FakeAdapter implements HttpClientAdapter {
  _FakeAdapter(this.handler);
  final Future<ResponseBody> Function(RequestOptions options) handler;
  @override
  Future<ResponseBody> fetch(RequestOptions options, Stream<Uint8List>? requestStream, Future<void>? cancelFuture) =>
      handler(options);
  @override
  void close({bool force = false}) {}
}

void main() {
  test('get parses json body', () async {
    final dio = Dio(BaseOptions(baseUrl: 'http://x'));
    dio.httpClientAdapter = _FakeAdapter((o) async {
      return ResponseBody.fromString('{"balance": 15}', 200, headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      });
    });
    final client = ApiClient(dio);
    final body = await client.get('/api/credits');
    expect((body as Map)['balance'], 15);
  });

  test('non-2xx throws ApiException with code', () async {
    final dio = Dio(BaseOptions(baseUrl: 'http://x'));
    dio.httpClientAdapter = _FakeAdapter((o) async {
      return ResponseBody.fromString('{"code":"NOT_FOUND","message":"nope","data":null}', 404, headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      });
    });
    final client = ApiClient(dio);
    expect(
      () async => client.get('/api/outfits/00000000-0000-0000-0000-000000000000'),
      throwsA(isA<ApiException>()
          .having((e) => e.code, 'code', 'NOT_FOUND')
          .having((e) => e.message, 'message', 'nope')),
    );
  });
}