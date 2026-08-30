import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'app/app.dart';
import 'core/auth/auth_service.dart';
import 'core/auth/auth_state.dart';
import 'core/auth/kratos_client.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(ProviderScope(
    overrides: [
      authServiceProvider.overrideWithValue(AuthService(
        kratos: KratosClient(
          baseUrl: const String.fromEnvironment(
            'KRATOS_URL',
            defaultValue: 'http://localhost:4433',
          ),
        ),
        storage: const FlutterSecureStorage(),
      )),
    ],
    child: const KurasiApp(),
  ));
}