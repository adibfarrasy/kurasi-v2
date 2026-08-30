import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'app/app.dart';
import 'core/auth/auth_service.dart';
import 'core/auth/auth_state.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp();
  runApp(ProviderScope(
    overrides: [
      authServiceProvider.overrideWithValue(AuthService(
        auth: FirebaseAuth.instance,
        googleSignIn: GoogleSignIn(
          serverClientId:
              '1022627012101-1o95h30br6qgdho0ial4dcjc7tidu17b.apps.googleusercontent.com',
        ),
      )),
    ],
    child: const KurasiApp(),
  ));
}