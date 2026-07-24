# ── Stage 1: build ───────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

RUN npm install -g pnpm

# Copy workspace manifests first (better layer caching)
COPY package.json pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY packages/db/package.json      ./packages/db/
COPY packages/shared/package.json  ./packages/shared/
COPY apps/api/package.json         ./apps/api/

# NOTE: commit a pnpm-lock.yaml and restore `--frozen-lockfile` for reproducible builds.
RUN pnpm install

# Copy source
COPY packages/db/      ./packages/db/
COPY packages/shared/  ./packages/shared/
COPY apps/api/         ./apps/api/

# Build in dependency order
RUN pnpm --filter @erp/shared build
RUN pnpm --filter @erp/db build
RUN pnpm --filter @erp/api build

# ── Stage 2: run ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

RUN npm install -g pnpm

COPY --from=builder /app/package.json           ./
COPY --from=builder /app/pnpm-workspace.yaml    ./
COPY --from=builder /app/node_modules           ./node_modules

COPY --from=builder /app/packages/shared/dist       ./packages/shared/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/
COPY --from=builder /app/packages/db/dist           ./packages/db/dist
COPY --from=builder /app/packages/db/package.json   ./packages/db/

COPY --from=builder /app/apps/api/dist          ./apps/api/dist
COPY --from=builder /app/apps/api/package.json  ./apps/api/

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "apps/api/dist/index.js"]

# ── Stage 3: migrate (one-shot DB bootstrap) ─────────────────────────────────
# Reuses the full builder image (drizzle-kit + schema + migrations folder) to
# create/upgrade the database schema, then exits. Compose runs this once before
# the API starts (api depends_on migrate: service_completed_successfully).
#
#   DB_BOOTSTRAP=migrate  → apply committed migrations (production path; run
#                           `pnpm db:generate` and commit packages/db/src/migrations first)
#   DB_BOOTSTRAP=push     → create schema directly from the TS schema, no migration
#                           files needed (handy for a greenfield first install)
FROM builder AS migrate
WORKDIR /app
ENV DB_BOOTSTRAP=migrate
CMD ["sh", "-c", "pnpm --filter @erp/db db:${DB_BOOTSTRAP}"]
