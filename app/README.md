# Kurasi app

Flutter client for Kurasi, a personal wardrobe management and style discovery
platform. Handles sign-in, onboarding, and the wardrobe/try-on/my-fit flows
against the Rust backend in `../backend`.

## Setup

```sh
flutter pub get
```

### Firebase setup

Auth uses Firebase (via `firebase_auth` + `google_sign_in`), so a Firebase
project is **required** for sign-in to work.

1. Create/register a Firebase app for bundle id `com.kurasi.kurasi`.
2. iOS: download `GoogleService-Info.plist` and place it at
   `ios/Runner/GoogleService-Info.plist`.
3. Android: download `google-services.json` and place it at
   `android/app/google-services.json`, then add the Google services Gradle
   plugin in `android/`:
   - `android/settings.gradle.kts`:
     `id("com.google.gms.google-services") version "<latest>" apply false`
   - `android/app/build.gradle.kts`:
     `id("com.google.gms.google-services")`
4. The iOS Google sign-in uses the URL scheme
   `com.googleusercontent.apps.1022627012101-1o95h30br6qgdho0ial4dcjc7tidu17b`
   (already registered in `ios/Runner/Info.plist`). Ensure the iOS client id
   matches the one in `lib/main.dart` (`serverClientId`).

## Running

```sh
flutter run --dart-define=API_URL=http://localhost:8989
```

`API_URL` defaults to `http://localhost:8989` (the local backend).

## Checks

```sh
flutter analyze
flutter test
```