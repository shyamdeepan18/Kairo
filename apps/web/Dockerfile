# ── Stage 1: build React app ──────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

ARG VITE_API_BASE_URL=/api
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

RUN npm install -g pnpm

COPY package.json pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/web/package.json        ./apps/web/

# NOTE: commit a pnpm-lock.yaml and restore `--frozen-lockfile` for reproducible builds.
RUN pnpm install

COPY packages/shared/ ./packages/shared/
COPY apps/web/        ./apps/web/

RUN pnpm --filter @erp/shared build
RUN pnpm --filter @erp/web build

# ── Stage 2: serve via nginx ──────────────────────────────────────────────────
FROM nginx:1.25-alpine AS runner

COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
