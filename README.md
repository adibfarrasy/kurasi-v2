# Kurasi

A personal wardrobe management and style discovery platform for fashion enthusiasts who want to build intentional, cohesive wardrobes. Track your pieces, create outfits, get AI-powered recommendations based on your style profile, and share curated looks.

See [CLAUDE.md](./CLAUDE.md) for the full product vision and scope.

## Stack

Bun workspaces monorepo:

- **`app/`** — Expo (React Native) mobile client. TanStack Query, oRPC client, Better Auth, Uniwind/Tailwind.
- **`backend/`** — Bun HTTP server. Drizzle ORM on Postgres, oRPC, Better Auth, AI SDK (Gemini, Fal).
- **`specs/`** — Allium behavioural specifications.

## Prerequisites

- [Bun](https://bun.sh)
- [Task](https://taskfile.dev) — task runner (`brew install go-task`)
- Postgres (the `be-infra` task spins one up via Docker Compose, or bring your own)
- `backend/.env.development.local` with DB URL and provider keys

## Setup

```bash
bun install
```

## Development

Run each in its own terminal:

```bash
task be-infra           # local Postgres + supporting services (optional if you have your own)
task drizzle-push:local # apply schema to the local DB
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
task lint        # Biome
task typecheck   # tsc across workspaces
task test        # bun test
task ci          # all of the above
```

## Useful commands

```bash
task --list                  # list all tasks
task generate-auth-schema    # regenerate Better Auth Drizzle schema
task drizzle-push:prod       # push schema to production DB
```
