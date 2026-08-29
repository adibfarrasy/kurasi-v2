# Kurasi

A personal wardrobe management and style discovery platform for fashion enthusiasts who want to build intentional, cohesive wardrobes. Track your pieces, create outfits, get AI-powered recommendations based on your style profile, and share curated looks.

See [CLAUDE.md](./CLAUDE.md) for the full product vision and scope.

## Stack

Monorepo:

- **`app/`** — Expo (React Native) mobile client. TanStack Query, Uniwind/Tailwind.
- **`backend/`** — Rust backend (Axum + sqlx on Postgres). Firebase Auth.
- **`specs/`** — Allium behavioural specifications.

## Prerequisites

- [Bun](https://bun.sh) (app)
- [Rust](https://rustup.rs) (backend)
- [Task](https://taskfile.dev) — task runner (`brew install go-task`)
- [sqlx-cli](https://crates.io/crates/sqlx-cli) — `cargo install sqlx-cli`
- Postgres (the `be-infra` task spins one up via Docker Compose, or bring your own)

## Setup

```bash
bun install
cd backend && cargo build
```

## Development

Run each in its own terminal:

```bash
task be-infra           # local Postgres + Mailpit (optional if you have your own)
task db-migrate:local   # apply sqlx migrations to the local DB
task be-dev             # backend with hot reload
task app-dev            # Expo dev server — press i / a / w to launch
```

Native builds for the Expo app:

```bash
cd app && bun run ios        # local iOS build
cd app && bun run android    # local Android build
task app-build:ios-simulator # EAS dev client (simulator)
task app-build:ios           # EAS dev client (device)
```

## Checks

```bash
task lint        # Biome (app)
task typecheck   # tsc across workspaces (app)
task test        # bun test (app)
task be-lint     # cargo clippy
task be-test     # cargo test (needs local Postgres)
task ci          # all of the above
```

## Useful commands

```bash
task --list                  # list all tasks
task be-build                # build backend release binary
task reset-db:local          # reset local DB and re-run migrations
```

## Docker

Build and run the backend image:

```bash
docker build -t kurasi-backend ./backend
docker run -p 8989:8989 -e DATABASE_URL=postgresql://postgres:postgres@host.docker.internal:5437/postgres kurasi-backend
```

Static asset dirs (`CLOTHING_DIR`, `AVATAR_DIR`) are runtime env/volumes; mount a repo-mirroring layout to use the defaults.