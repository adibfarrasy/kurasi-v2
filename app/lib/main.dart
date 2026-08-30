import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'core/auth/auth_service.dart';
import 'core/auth/auth_state.dart';
import 'core/theme/app_theme.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp();
  final authService = AuthService(
    auth: FirebaseAuth.instance,
    googleSignIn: GoogleSignIn(
      serverClientId: '1022627012101-1o95h30br6qgdho0ial4dcjc7tidu17b.apps.googleusercontent.com',
    ),
  );
  runApp(ProviderScope(
    overrides: [authServiceProvider.overrideWithValue(authService)],
    child: const KurasiApp(),
  ));
}

class KurasiApp extends StatelessWidget {
  const KurasiApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Kurasi',
      theme: AppTheme.light,
      darkTheme: AppTheme.dark,
      home: const HomePage(),
    );
  }
}

class HomePage extends StatelessWidget {
  const HomePage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Kurasi'),
      ),
      body: const Center(
        child: Text('Kurasi'),
      ),
    );
  }
}