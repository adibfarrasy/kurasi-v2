import 'package:firebase_auth/firebase_auth.dart' as fa;
import 'package:google_sign_in/google_sign_in.dart';

class AuthUser {
  AuthUser({required this.id, required this.email, this.name, this.photoUrl});
  final String id;
  final String email;
  final String? name;
  final String? photoUrl;
}

class AuthService {
  AuthService({required fa.FirebaseAuth auth, required GoogleSignIn googleSignIn})
      : _auth = auth,
        _googleSignIn = googleSignIn;
  final fa.FirebaseAuth _auth;
  final GoogleSignIn _googleSignIn;

  Stream<AuthUser?> authChanges() => _auth.authStateChanges().map(_fromFirebase);

  AuthUser? _fromFirebase(fa.User? u) {
    if (u == null) return null;
    return AuthUser(id: u.uid, email: u.email ?? '', name: u.displayName, photoUrl: u.photoURL);
  }

  Future<AuthUser?> signInWithGoogle() async {
    final account = await _googleSignIn.signIn();
    if (account == null) return null;
    final auth = await account.authentication;
    final credential = fa.GoogleAuthProvider.credential(idToken: auth.idToken, accessToken: auth.accessToken);
    final result = await _auth.signInWithCredential(credential);
    return _fromFirebase(result.user);
  }

  Future<void> signOut() async {
    await _googleSignIn.signOut();
    await _auth.signOut();
  }

  Future<String?> currentIdToken() async => _auth.currentUser?.getIdToken();
}