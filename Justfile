set shell := ["bash", "-c"]

DATABASE_URL := env_var_or_default("DATABASE_URL", "postgresql://postgres:postgres@127.0.0.1:5437/postgres")

# Run the Flutter app
app-dev:
    cd app && flutter run

# Analyze the Flutter app
app-analyze:
    cd app && flutter analyze

# Run Flutter tests
app-test:
    cd app && flutter test

# Run local Postgres + Mailpit
be-infra:
    cd backend && docker compose up

# Rebuild + run the backend
be-dev:
    cd backend && cargo run

# Build the backend release binary
be-build:
    cd backend && cargo build --release

# Lint the backend (clippy)
be-lint:
    cd backend && cargo clippy --all-targets -- -D warnings

# Run backend tests (needs local Postgres; override DATABASE_URL if different)
be-test:
    cd backend && DATABASE_URL={{DATABASE_URL}} cargo test

# Apply sqlx migrations to the local DB
db-migrate-local:
    cd backend && DATABASE_URL={{DATABASE_URL}} sqlx migrate run --source ./migrations

# Reset the local DB and re-run migrations
reset-db-local:
    cd backend && docker compose down -v && docker compose up -d
    @until docker compose exec -T db pg_isready -U postgres >/dev/null 2>&1; do sleep 0.5; done
    just db-migrate-local

# Run all CI checks (app + backend)
ci:
    just app-analyze
    just app-test
    just be-lint
    just be-test
# Create (if missing) a local Kratos password user and print a session token.
# Local-only: relies on the password method enabled in backend/docker-compose.yml.
dev-user email="dev@kurasi.local" password="kurasi-dev-password":
    #!/usr/bin/env bash
    set -euo pipefail
    curl -sf -o /dev/null -X POST http://localhost:4434/admin/identities \
      -H 'Content-Type: application/json' \
      -d '{"schema_id":"default","traits":{"email":"{{email}}","name":"Dev User"},"credentials":{"password":{"config":{"password":"{{password}}"}}}}' \
      || true
    flow=$(curl -sf http://localhost:4433/self-service/login/api | jq -r .id)
    curl -sf -X POST "http://localhost:4433/self-service/login?flow=$flow" \
      -H 'Content-Type: application/json' \
      -d '{"method":"password","identifier":"{{email}}","password":"{{password}}"}' \
      | jq -r .session_token

# Run the app on the Android emulator signed in as the dev user (no Google needed)
app-dev-user:
    cd app && flutter run \
      --dart-define=API_URL=http://10.0.2.2:8989 \
      --dart-define=KRATOS_URL=http://10.0.2.2:4433 \
      --dart-define=DEV_SESSION_TOKEN=$(just dev-user)
