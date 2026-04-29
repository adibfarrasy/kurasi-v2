# Build context must be the monorepo root (see backend/fly.development.toml — `fly deploy .`).
# https://bun.com/docs/guides/ecosystem/docker
ARG BUN_VERSION=1.3.13
FROM oven/bun:${BUN_VERSION}-slim AS base
LABEL fly_launch_runtime="Bun"
WORKDIR /usr/src/app

### Install production dependencies for workspace package "backend" only
FROM base AS install
COPY package.json bun.lock ./
COPY backend/package.json ./backend/
COPY app/package.json ./app/
RUN bun install --frozen-lockfile --production --filter backend

### Runtime image
FROM base AS release
ENV NODE_ENV=production
COPY package.json bun.lock ./
COPY --from=install /usr/src/app/node_modules ./node_modules
COPY --from=install /usr/src/app/backend/node_modules ./backend/node_modules
COPY backend ./backend
WORKDIR /usr/src/app/backend
EXPOSE 8989
CMD ["bun", "run", "start"]
