import 'package:flutter_riverpod/flutter_riverpod.dart';

/// In-memory profile selected during onboarding wheels — read by the
/// membership-card screen so it can render the user's choices on the card.
/// The face is captured via a separate route and stored in [facePhotoProvider].
final genderProvider = StateProvider<String>((ref) => 'Male');
final heightProvider = StateProvider<int>((ref) => 165);
final weightProvider = StateProvider<int>((ref) => 62);

/// URI of the captured face photo, null until the user completes
/// capture-face. Consumed by the membership-card screen (avatar job) and
/// sent with the biometrics payload on onboarding-3.
final facePhotoProvider = StateProvider<String?>((ref) => null);