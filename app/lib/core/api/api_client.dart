import 'package:dio/dio.dart';
import 'api_exception.dart';

String apiBaseUrl() => const String.fromEnvironment('API_URL', defaultValue: 'http://localhost:8989');

class ApiClient {
  ApiClient(this.dio);
  final Dio dio;

  Future<dynamic> get(String path, {Map<String, dynamic>? query}) async {
    return _guard(() => dio.get(path, queryParameters: query));
  }

  Future<dynamic> post(String path, {Object? body}) async {
    return _guard(() => dio.post(path, data: body));
  }

  Future<dynamic> patch(String path, {Object? body}) async {
    return _guard(() => dio.patch(path, data: body));
  }

  Future<dynamic> delete(String path, {Object? body}) async {
    return _guard(() => dio.delete(path, data: body));
  }

  Future<dynamic> _guard(Future<Response> Function() call) async {
    try {
      final res = await call();
      return res.data;
    } on DioException catch (e) {
      final data = e.response?.data;
      if (data is Map && data['code'] is String) {
        throw ApiException(data['code'] as String, (data['message'] as String?) ?? e.message ?? 'Error', data['data']);
      }
      throw ApiException('NETWORK', e.message ?? 'Network error', null);
    }
  }
}