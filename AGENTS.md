# Kurasi

Monorepo for the Kurasi app: Flutter client in `app/`, Rust backend in `backend/`, shared tooling at the repo root.

## Project setup

App

```sh
just app-dev        # run the Flutter app
just app-analyze    # flutter analyze
just app-test       # flutter test
```

Backend

```sh
just be-infra         # local Postgres + Mailpit
just db-migrate-local # apply sqlx migrations
just be-dev           # rebuild + run the backend
```

## DB Migration

```sh
just db-migrate-local  # apply sqlx migrations to the local DB
just reset-db-local    # reset the local DB and re-run migrations
```

## Agent workflow

After making changes, run **`just ci`** from the repository root to run the same checks as CI (flutter analyze, flutter test, cargo clippy, cargo test). Fix anything that fails before considering the work done.