# Kurasi app

Flutter client for Kurasi, a personal wardrobe management and style discovery
platform. Handles sign-in, onboarding, and the wardrobe/try-on/my-fit flows
against the Rust backend in `../backend`.

## Setup

```sh
flutter pub get
```

### Kratos auth

Auth uses Ory Kratos (OIDC) via `flutter_web_auth_2`. The app runs the Kratos
browser login flow, exchanges the session for a tokenized JWT, and stores it in
`flutter_secure_storage`. A running Kratos instance is required for sign-in;
point the app at it with `--dart-define=KRATOS_URL` (default
`http://localhost:4433`). The OIDC callback scheme `kurasi` is registered in
`ios/Runner/Info.plist`.

## Running

```sh
flutter run --dart-define=API_URL=http://localhost:8989 --dart-define=KRATOS_URL=http://localhost:4433
```

`API_URL` defaults to `http://localhost:8989` (the local backend).

## Checks

```sh
flutter analyze
flutter test
```