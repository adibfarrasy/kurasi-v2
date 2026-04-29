# Kurasi

Monorepo for the Kurasi app: Expo client in `app/`, Bun backend in `backend/`, shared tooling at the repo root.

## Project setup

App

```sh
# Optional
task ios-clean-prebuild

# Build and run iOS app in Simulator
task ios-dev
```

Backend

```sh
task be-infra
task drizzle-migrate:local
task be-dev
```

## DB Migration

```sh
task generate-auth-schema
task drizzle-generate
```

## Styling

This project uses Tailwind (with Uniwind). Prefer classNames over style.

## React Practices

- React Compiler is installed, so useMemo and useCallback are unnecessary.

## Agent workflow

After making changes, run **`task ci`** from the repository root to run the same checks as CI (Biome, typecheck, tests). Fix anything that fails before considering the work done.
