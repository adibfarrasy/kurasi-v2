# Kratos (self-hosted auth)

Ory Kratos configured for local development: OIDC sign-in with Google, sessions,
and session-to-JWT exchange consumed by the Rust backend.

## Layout

| File | Purpose |
| --- | --- |
| `kratos.yml` | Kratos configuration (OIDC provider, session tokenizer, identity schemas) |
| `identity.schema.json` | Identity schema: `email`, `name`, `picture` traits |
| `claims.jsonnet` | Maps a Kratos identity to JWT claims (email/name/picture) |
| `oidc.google.jsonnet` | Maps Google OIDC claims to identity traits |
| `jwk.json` | **DEV-ONLY** RSA JWK set (kid `kurasi-dev`) used to sign tokenizer JWTs |

## Local dev run

`task be-infra` (i.e. `docker compose up`) in `backend/` starts Postgres, Mailpit,
and Kratos. Kratos runs its own dedicated `kratos-db` Postgres so it never touches
the app database. Public API is on `http://localhost:4433`, admin on
`http://localhost:4434`.

Secrets are injected through Kratos's native env-var overrides (Kratos does not
interpolate `${...}` inside `kratos.yml`), so `kratos.yml` keeps `${...}`
placeholders and the compose `environment:` block supplies real values via the
underscore key paths (e.g. `SELFSERVICE_METHODS_OIDC_CONFIG_PROVIDERS_0_CLIENT_ID`).
The compose `DSN` env also overrides the `dsn:` in `kratos.yml`, pointing Kratos at
its dedicated `kratos-db`.

```sh
export GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=...
export KRATOS_COOKIE_SECRET=... KRATOS_CIPHER_SECRET=...
docker compose up
```

`KRATOS_COOKIE_SECRET` and `KRATOS_CIPHER_SECRET` must be 32 bytes each.

## Sign-in flow (app)

1. App opens the login flow: `GET http://localhost:4433/self-service/login/browser`.
2. Kratos renders the OIDC button; user signs in with Google.
3. Google redirects back to Kratos; Kratos creates a session and sets a session cookie.
4. The app exchanges the session for a JWT:
   `GET http://localhost:4433/sessions/whoami?tokenize_as=api` (session cookie attached).
5. The app sends the JWT to the backend as `Authorization: Bearer <token>`.

The tokenizer JWTs are valid for 10m (`session.whoami.tokenizer.templates.api.ttl`).

## How the backend verifies

The backend verifier (`backend/src/kratos.rs`) resolves
`KRATOS_JWKS_URL` and validates `iss` against `KRATOS_ISSUER`.

Important: self-hosted Kratos does **not** expose its tokenizer signing keys at
`/.well-known/jwks.json` (or anywhere else over HTTP). You must serve the **public**
half of the JWK set yourself. For local dev, the backend default
`KRATOS_JWKS_URL=http://localhost:4433/jwks.json` expects the public keys served
there — e.g. a tiny static file server or reverse-proxy route that returns
`jwk.json` with only the public members (`kty`, `use`, `alg`, `kid`, `n`, `e`).

`KRATOS_ISSUER` must match the tokenizer issuer Kratos signs with. For the local
config this is the public base URL, `http://localhost:4433/`.

## Production notes

- **Keys**: `jwk.json` is dev-only and contains the private key. In production,
  generate a real key, keep the private JWK in Kratos's signing config, and serve
  the public JWK set at the backend's `KRATOS_JWKS_URL`. Never commit real keys.
- **`allowed_return_urls`**: restrict to your real app callback(s); also set
  `default_browser_return_url` to a real `https` URL.
- **OIDC client**: create a Google OAuth client with the Kratos callback URL
  `<public base>/self-service/methods/oidc/callback/google`, and restrict the
  redirect URI list.
- **Secrets**: rotate `KRATOS_COOKIE_SECRET` / `KRATOS_CIPHER_SECRET` and inject
  them from a secret store, not `.env` in the image.
- `login`, `settings` and `error` `ui_url`s currently point at the app; the
  self-service UI pages are out of scope for this auth-only backend.