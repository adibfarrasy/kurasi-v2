# Kurasi

Monorepo for the Kurasi app: Expo client in `app/`, Bun backend in `backend/`, shared tooling at the repo root.

## Agent workflow

After making changes, run **`task ci`** from the repository root to run the same checks as CI (Biome, typecheck, tests). Fix anything that fails before considering the work done.
