# Phase 9 — Docker Compose Deployment (on-prem Windows Server): Design

_Date: 2026-07-01 · Target: single `docker compose up -d` on a customer Windows Server (Docker Desktop / WSL2)_

## What already exists (and is good)

The repo already ships a workable stack, so this is a hardening pass, not a rewrite:

- `docker-compose.yml` — postgres + redis + api + web, with healthchecks, named volumes, `restart: unless-stopped`, and the API not exposed (nginx proxies it).
- `apps/api/Dockerfile`, `apps/web/Dockerfile` — multi-stage (build → slim runner); web served by nginx.
- `apps/web/nginx.conf` — proxies `/api/` → `api:3000`, SPA fallback, static caching.

The architecture is right: **one public port (80) on the web/nginx container; everything else on the internal bridge network.** All four services (PostgreSQL, Node API, Redis, React) run as **Linux containers** inside Docker Desktop's WSL2 VM — no Windows containers needed.

## Gaps to close before it runs at a customer site

1. **No database bootstrap.** Nothing creates the schema or seeds data on a fresh box. `pnpm db:migrate` is never run, and there are no migrations generated. → add a one-shot `migrate` service that applies migrations + base seeds, and gate the API on it.
2. **`--frozen-lockfile` with no committed `pnpm-lock.yaml`.** Both Dockerfiles run `pnpm install --frozen-lockfile`; that **fails** without a lockfile. → commit `pnpm-lock.yaml` (or drop `--frozen-lockfile`).
3. **No log rotation.** A long-running unattended box will fill the disk with container logs. → add `logging` limits to every service.
4. **No timezone.** Indian fiscal dates / GST timestamps need `TZ=Asia/Kolkata` on postgres + api.
5. **No backups.** `postgres_data` lives inside WSL2; a nightly `pg_dump` to a host-mounted folder is needed (Phase 9 "backup scheduler").
6. **Port 80 conflicts with IIS** on Windows Server. → stop/disable IIS, or map a different host port.
7. **HTTP only.** Fine for a trusted LAN; add TLS in nginx if exposed.

## Recommended `docker-compose.yml`

```yaml
# Production — customer Windows Server. Usage: docker compose up -d
# (the obsolete top-level `version:` key is intentionally omitted)

x-logging: &default-logging
  driver: json-file
  options: { max-size: "10m", max-file: "5" }

services:
  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_DB: ${POSTGRES_DB:-erp_db}
      POSTGRES_USER: ${POSTGRES_USER:-erp}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}
      TZ: ${TZ:-Asia/Kolkata}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-erp} -d ${POSTGRES_DB:-erp_db}"]
      interval: 10s
      timeout: 5s
      retries: 5
    logging: *default-logging

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    command: ["redis-server", "--appendonly", "yes"]   # persist permission cache across restarts
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
    logging: *default-logging

  # One-shot: apply migrations + base seeds, then exit. API waits for it to finish.
  migrate:
    build: { context: ., dockerfile: apps/api/Dockerfile, target: migrate }
    restart: "no"
    environment:
      DATABASE_URL: postgresql://${POSTGRES_USER:-erp}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB:-erp_db}
      TZ: ${TZ:-Asia/Kolkata}
    depends_on:
      postgres: { condition: service_healthy }
    logging: *default-logging

  api:
    build: { context: ., dockerfile: apps/api/Dockerfile, target: runner }
    restart: unless-stopped
    environment:
      DATABASE_URL: postgresql://${POSTGRES_USER:-erp}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB:-erp_db}
      REDIS_URL: redis://redis:6379
      JWT_SECRET: ${JWT_SECRET:?JWT_SECRET is required}
      JWT_ACCESS_EXPIRES_IN: ${JWT_ACCESS_EXPIRES_IN:-15m}
      REFRESH_TOKEN_EXPIRES_DAYS: ${REFRESH_TOKEN_EXPIRES_DAYS:-7}
      NODE_ENV: production
      API_PORT: 3000
      API_HOST: 0.0.0.0
      CORS_ORIGIN: ${CORS_ORIGIN:-http://localhost}
      TZ: ${TZ:-Asia/Kolkata}
    depends_on:
      postgres: { condition: service_healthy }
      redis:    { condition: service_healthy }
      migrate:  { condition: service_completed_successfully }
    expose: ["3000"]      # internal only — nginx proxies it
    logging: *default-logging

  web:
    build:
      context: .
      dockerfile: apps/web/Dockerfile
      args: { VITE_API_BASE_URL: /api }
    restart: unless-stopped
    ports:
      - "${HTTP_PORT:-80}:80"   # override to e.g. 8080 if IIS owns 80
    depends_on:
      api: { condition: service_healthy }
    logging: *default-logging

  # Nightly pg_dump into a host folder (bind mount survives container resets).
  backup:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      PGPASSWORD: ${POSTGRES_PASSWORD}
      TZ: ${TZ:-Asia/Kolkata}
    volumes:
      - ./backups:/backups
    entrypoint: ["sh", "-c", "while true; do
        pg_dump -h postgres -U ${POSTGRES_USER:-erp} -d ${POSTGRES_DB:-erp_db}
          -F c -f /backups/erp_$(date +%Y%m%d_%H%M%S).dump;
        find /backups -name '*.dump' -mtime +14 -delete;
        sleep 86400; done"]
    depends_on:
      postgres: { condition: service_healthy }
    logging: *default-logging

volumes:
  postgres_data:
  redis_data:
```

### Supporting changes this design assumes

- **`apps/api/Dockerfile`** gets a third stage `migrate` (build deps + `drizzle-kit` + the
  `packages/db/src/migrations` folder + drizzle config) whose `CMD` runs the migration + base
  seeds (permissions, then per-company number series via the seed scripts). Add an explicit
  `AS runner` label to the final stage (compose references `target: runner`).
- **Generate + commit migrations**: `pnpm db:generate` → commit `packages/db/src/migrations/*` so
  the `migrate` service has something to apply (today that folder is empty).
- **Commit `pnpm-lock.yaml`** so `--frozen-lockfile` works in the image build.
- **`.gitattributes`** with `* text=auto eol=lf` so Dockerfiles/scripts keep LF line endings when
  cloned on Windows (CRLF breaks `sh` entrypoints inside Linux containers).
- **`.env`** (copied from `.env.example`) adds the prod keys: `POSTGRES_PASSWORD`, `JWT_SECRET`,
  `CORS_ORIGIN=http://<server-ip>`, optional `HTTP_PORT`, `TZ=Asia/Kolkata`.

## Windows Server specifics

- **Docker Desktop + WSL2** (or Docker CE in a WSL2 distro). These Alpine Linux images run unchanged.
- **Named volumes, not bind mounts** for Postgres/Redis data — bind mounts onto NTFS paths are slow
  and have permission quirks under WSL2. The only bind mount here is `./backups` (acceptable; it's
  write-only dumps).
- **Autostart on boot**: set Docker Desktop to start at login / run as a service, and
  `restart: unless-stopped` brings the stack back after a server reboot.
- **Firewall**: open inbound TCP `${HTTP_PORT}` (80) on the LAN profile only.
- **Upgrades**: `git pull && docker compose build && docker compose up -d` — the `migrate` service
  re-runs and applies any new migrations before the new API starts.

## Install runbook (customer site)

```powershell
# 1. Install Docker Desktop (WSL2 backend) and reboot.
git clone <repo> erp; cd erp
copy .env.example .env        # set POSTGRES_PASSWORD, JWT_SECRET, CORS_ORIGIN=http://<server-ip>
docker compose up -d --build  # builds images, runs migrate, starts api + web + backup
# 2. One-time app bootstrap (until wrapped into the migrate service):
#    permissions + roles, then per-company COA + number series.
# 3. Browse to http://<server-ip>
```

## Open items / follow-ups

- Wrap the per-company onboarding (COA seed + `seed*NumberSeries`) behind an app endpoint or an
  idempotent bootstrap so non-technical installers don't run tsx scripts by hand.
- Optional TLS: terminate HTTPS in nginx (mount certs) or front the stack with Caddy for
  auto-certs if the box is internet-reachable.
- Resource limits (`deploy.resources` / `mem_limit`) sized to the customer hardware.
- Restore drill: document `pg_restore -F c` from a `./backups/*.dump`.
```
