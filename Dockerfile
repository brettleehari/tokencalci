# Deterministic setup for contributors, and a deployment target that is not tied to
# one hosting account.
#
# Two reasons this exists beyond convenience. A contributor should be able to get a
# working copy without matching a Node version by hand — this repository has already
# cost one afternoon to a stray x86_64 node shadowing nvm on an arm64 Mac. And the
# OSS Scanner programme on the roadmap (3.4) requires an image that builds offline,
# so the prerequisite is worth holding ready.
#
#   docker build -t tokencalci .
#   docker run --rm -p 3001:3001 tokencalci
#
# The app reads committed snapshots and falls back to them when a feed is
# unreachable, so the container works with no network at all — which is also how the
# test suite is written.

# ---- build ------------------------------------------------------------------
FROM node:20-slim AS build
WORKDIR /app

# Dependencies first, so a source-only change does not reinstall them.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# The suite is part of the build: an image that serves a broken route table is
# worse than a build that fails. It needs dist, which is why it runs after.
RUN npm test

# ---- runtime ----------------------------------------------------------------
FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001

# Production dependencies only — the build stage keeps vite and the test runner.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# The server, the built frontend, and the committed data it serves.
COPY --from=build /app/dist ./dist
COPY server ./server
COPY client/src ./client/src
COPY docs ./docs
COPY SKILL.md ./SKILL.md

# Run unprivileged; the image writes nothing at runtime.
USER node

EXPOSE 3001

# Hitting a real route rather than the process table: a route-table error kills the
# server at startup, which is exactly the failure a liveness check should catch.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/index.js"]
