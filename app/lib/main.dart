import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'app/app.dart';
import 'core/auth/auth_service.dart';
import 'core/auth/auth_state.dart';
import 'core/auth/kratos_client.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final kratos = KratosClient(
    baseUrl: const String.fromEnvironment(
      'KRATOS_URL',
      defaultValue: 'http://localhost:4433',
    ),
  );
  const storage = FlutterSecureStorage();
  // Lets local dev sign in without Google OAuth credentials; kDebugMode keeps
  // it out of release builds even if the define is passed.
  const devSessionToken = String.fromEnvironment('DEV_SESSION_TOKEN');
  if (kDebugMode && devSessionToken.isNotEmpty) {
    await AuthService.adoptSessionToken(
        kratos: kratos, storage: storage, sessionToken: devSessionToken);
  }
  runApp(ProviderScope(
    overrides: [
      authServiceProvider
          .overrideWithValue(AuthService(kratos: kratos, storage: storage)),
    ],
    child: const KurasiApp(),
  ));
}