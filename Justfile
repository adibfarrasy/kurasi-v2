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