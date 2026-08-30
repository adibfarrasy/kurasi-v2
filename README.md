# Kurasi

A personal wardrobe management and style discovery platform for fashion enthusiasts who want to build intentional, cohesive wardrobes. Track your pieces, create outfits, get AI-powered recommendations based on your style profile, and share curated looks.

See [CLAUDE.md](./CLAUDE.md) for the full product vision and scope.

## Stack

Monorepo:

- **`app/`** — Flutter mobile client. Kratos (OIDC) auth.
- **`backend/`** — Rust backend (Axum + sqlx on Postgres). Kratos (OIDC) auth.
- **`specs/`** — Allium behavioural specifications.

## Prerequisites

- [Flutter](https://docs.flutter.dev) (app)
- [Rust](https://rustup.rs) (backend)
- [Just](https://just.systems) — task runner (`brew install just`)
- [sqlx-cli](https://crates.io/crates/sqlx-cli) — `cargo install sqlx-cli`
- Postgres (the `be-infra` recipe spins one up via Docker Compose, or bring your own)

## Setup

```bash
cd app && flutter pub get
cd backend && cargo build
```

## Development

Run each in its own terminal:

```bash
just be-infra           # local Postgres + Mailpit (optional if you have your own)
just db-migrate-local   # apply sqlx migrations to the local DB
just be-dev             # rebuild + run
just app-dev            # run the Flutter app on a connected device/simulator
```

## Checks

```bash
just app-analyze # flutter analyze (app)
just app-test    # flutter test (app)
just be-lint     # cargo clippy
just be-test     # cargo test (needs local Postgres)
just ci          # all of the above
```

## Useful commands

```bash
just --list                  # list all recipes
just be-build                # build backend release binary
just reset-db-local          # reset local DB and re-run migrations
```

## Docker

Build and run the backend image:

```bash
docker build -t kurasi-backend ./backend
docker run -p 8989:8989 -e DATABASE_URL=postgresql://postgres:postgres@host.docker.internal:5437/postgres kurasi-backend
```

Static asset dirs (`CLOTHING_DIR`, `AVATAR_DIR`) are runtime env/volumes; mount a repo-mirroring layout to use the defaults.