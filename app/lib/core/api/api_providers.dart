import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../auth/auth_state.dart';
import 'api_client.dart';

final dioProvider = Provider<Dio>((ref) {
  final dio = Dio(BaseOptions(baseUrl: apiBaseUrl()));
  dio.interceptors.add(InterceptorsWrapper(
    onRequest: (options, handler) async {
      final token = await ref.read(authServiceProvider).currentIdToken();
      if (token != null) {
        options.headers['Authorization'] = 'Bearer $token';
      }
      handler.next(options);
    },
    onError: (error, handler) async {
      final is401 = error.response?.statusCode == 401;
      if (is401 && !error.requestOptions.extra.containsKey('_retried')) {
        final fresh =
            await ref.read(authServiceProvider).refreshTokenIfNeeded();
        if (fresh != null) {
          final options = error.requestOptions;
          options.extra['_retried'] = true;
          options.headers['Authorization'] = 'Bearer $fresh';
          try {
            handler.resolve(await dio.fetch(options));
          } catch (e) {
            handler.reject(
              e is DioException
                  ? e
                  : DioException(requestOptions: options, error: e),
            );
          }
          return;
        }
      }
      if (is401) {
        unawaited(ref.read(authStateProvider.notifier).signOut());
      }
      handler.next(error);
    },
  ));
  return dio;
});

final apiClientProvider =
    Provider<ApiClient>((ref) => ApiClient(ref.watch(dioProvider)));
