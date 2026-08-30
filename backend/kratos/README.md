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
| `jwk.json` | **DEV-ONLY** RSA JWK set (kid `kurasi-dev`) used by Kratos to sign tokenizer JWTs. Contains the private key — never deploy it. |
| `jwk.public.json` | **PUBLIC HALF ONLY** of the same JWK set (kid `kurasi-dev`, `n`/`e` only). Served by the `kratos-jwks` compose service so the backend can verify tokenizer JWTs. |

## Local dev run

`just be-infra` (i.e. `docker compose up`) in `backend/` starts Postgres, Mailpit,
Kratos, and `kratos-jwks`. Kratos runs its own dedicated `kratos-db` Postgres so it
never touches the app database. Public API is on `http://localhost:4433`, admin on
`http://localhost:4434`. `kratos-jwks` serves the public JWK set at
`http://localhost:4435/jwks.json` (self-hosted Kratos does not expose its signing
keys over HTTP).

Kratos does not interpolate `${...}` inside `kratos.yml`, so the OIDC provider block
there keeps `${...}` placeholders. The compose `kratos` service overrides the whole
provider list with a single `SELFSERVICE_METHODS_OIDC_CONFIG_PROVIDERS` JSON env var
(Kratos parses env values as JSON when valid JSON), which docker compose interpolates
from the shell env. The compose `DSN` env also overrides the `dsn:` in `kratos.yml`,
pointing Kratos at its dedicated `kratos-db`.

```sh
export GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=...
export KRATOS_COOKIE_SECRET=... KRATOS_CIPHER_SECRET=...
docker compose up
```

`KRATOS_COOKIE_SECRET` and `KRATOS_CIPHER_SECRET` must be 32 bytes each.

## Sign-in flow (app)

The app drives the Kratos **API** login flow with a session-token exchange:

1. `GET http://localhost:4433/self-service/login/api?return_session_token_exchange_code=true&return_to=kurasi://callback` (JSON) → flow id.
2. `POST http://localhost:4433/self-service/login/strategies/oidc` with `{flow, provider: "google"}` → `redirect_browser_to`.
3. Open `redirect_browser_to` in a web view; the final callback URL carries a `code`.
4. `GET http://localhost:4433/sessions/token-exchange?init_code=<code>&return_to_code=` → `session_token`.
5. `GET http://localhost:4433/sessions/whoami?tokenize_as=api` (session token as Bearer) → tokenizer JWT.
6. The app sends the JWT to the backend as `Authorization: Bearer <token>`.

Tokenizer JWTs are valid for 10m (`session.whoami.tokenizer.templates.api.ttl`); the
app re-tokenizes from the held session token near expiry and on 401.

## How the backend verifies

The backend verifier (`backend/src/kratos.rs`) resolves `KRATOS_JWKS_URL` and
validates `iss` against `KRATOS_ISSUER`. `KRATOS_ISSUER` must match the tokenizer
issuer Kratos signs with — for the local config that is the public base URL,
`http://localhost:4433/`.

For local dev, the `kratos-jwks` compose service serves `jwk.public.json` (public
members only: `kty`, `use`, `alg`, `kid`, `n`, `e`) at
`KRATOS_JWKS_URL=http://localhost:4435/jwks.json`.

## Production notes

- **Keys**: `jwk.json` is dev-only and contains the private key. In production,
  generate a real key, keep the private JWK in Kratos's signing config, and serve
  **only the public half** at the backend's `KRATOS_JWKS_URL`. Never commit real
  keys. The backend hard-refuses tokens whose key `kid` is `kurasi-dev` when
  `ENVIRONMENT=production`, so a dev key can never be mistaken for a prod key.
- **Issuer**: set `KRATOS_ISSUER` to Kratos's `serve.public.base_url`.
  `ENVIRONMENT=production` fails fast at startup if it is left at the placeholder.
- **`allowed_return_urls`**: restrict to your real app callback(s); also set
  `default_browser_return_url` to a real `https` URL.
- **OIDC client**: create a Google OAuth client with the Kratos callback URL
  `<public base>/self-service/methods/oidc/callback/google`, and restrict the
  redirect URI list.
- **Secrets**: rotate `KRATOS_COOKIE_SECRET` / `KRATOS_CIPHER_SECRET` and inject
  them from a secret store, not `.env` in the image.
- `login`, `settings` and `error` `ui_url`s currently point at the app; the
  self-service UI pages are out of scope for this auth-only backend.