---
name: erp-app-orchestration
description: End-to-end orchestration runbook, network architecture guide, environment configuration, and diagnostic troubleshooting runbook for hosting, starting, migrating, and verifying the multi-tier ERP system (Docker PostgreSQL, Redis, Fastify API, Vite/React Web UI).
---

# ERP Application Orchestration & Hosting Runbook

Use this skill whenever booting, hosting, configuring, migrating, health-checking, or debugging the full-stack ERP application.

---

## 1. System Topology & Architecture

The ERP system operates as a unified multi-tier microservice & SPA architecture:

```mermaid
flowchart TD
    Browser["User Browser (Desktop/Mobile)"]
    
    subgraph Frontend["Frontend Tier (Port 5173)"]
        Vite["Vite Dev Server (apps/web)"]
        Client["Axios Client (apps/web/src/api/client.ts)"]
        ViteProxy["Vite Proxy (/api -> :3000)"]
    end

    subgraph Backend["Backend API Tier (Port 3000)"]
        Fastify["Fastify 4 REST API (apps/api)"]
        AuthMid["Auth & Tenant Middleware"]
        RouteHandlers["Domain Routes (/api/*)"]
    end

    subgraph Storage["Persistence & Cache Tier (Docker)"]
        Postgres["PostgreSQL 16 (Port 5433 -> 5432)"]
        Redis["Redis 7 (Port 6379)"]
    end

    Browser -->|HTTP :5173| Vite
    Vite --> Client
    Client -->|HTTP /api/*| ViteProxy
    ViteProxy -->|Reverse Proxy| Fastify
    Fastify --> AuthMid
    AuthMid --> RouteHandlers
    RouteHandlers -->|Drizzle ORM Connection Pool| Postgres
    AuthMid -->|Permission RBAC Cache| Redis
```

### Port Map
| Service | Host Port | Internal Port | Protocol | Description |
| :--- | :--- | :--- | :--- | :--- |
| **PostgreSQL** | `5433` | `5432` | TCP / PG Wire | Main relational database (`erp_db`) |
| **Redis** | `6379` | `6379` | TCP / RESP | RBAC permission cache & session store |
| **Fastify API** | `3000` | `3000` | HTTP / JSON | Core backend domain services |
| **Vite Web UI**| `5173` | `5173` | HTTP / HMR | React 18 + Tailwind SPA |

---

## 2. Environment Configuration (`.env`)

The system reads environment configuration from `/Users/shyam18/SEGA/ERP/.env`.

```bash
# ─── Database ────────────────────────────────────────────────────────────────
DATABASE_URL=postgresql://erp:erp_dev@localhost:5433/erp_db

# ─── Redis ───────────────────────────────────────────────────────────────────
REDIS_URL=redis://localhost:6379

# ─── Auth ────────────────────────────────────────────────────────────────────
JWT_SECRET=change-this-to-a-random-64-char-string-in-production
JWT_ACCESS_EXPIRES_IN=15m
REFRESH_TOKEN_EXPIRES_DAYS=7

# ─── API Server ───────────────────────────────────────────────────────────────
API_PORT=3000
API_HOST=0.0.0.0
CORS_ORIGIN=http://localhost:5173

# ─── App ─────────────────────────────────────────────────────────────────────
NODE_ENV=development
```

> [!IMPORTANT]
> The database runs on host port **5433** to avoid collisions with any local PostgreSQL instance installed on default port 5432. All connection strings and Drizzle configs must point to `localhost:5433`.

---

## 3. Step-by-Step Hosting & Bootstrapping Sequence

### Step 1: Start Containerized Infrastructure
Ensure Docker / OrbStack is running, then start Postgres and Redis:
```bash
cd /Users/shyam18/SEGA/ERP
docker compose -f docker-compose.dev.yml up -d
```
Verify container health:
```bash
docker ps --filter "name=erp-"
# Expected: erp-postgres-1 (healthy, port 5433), erp-redis-1 (port 6379)
```

### Step 2: Apply Database Migrations
Run Drizzle migrations against the database:
```bash
cd /Users/shyam18/SEGA/ERP
pnpm db:migrate
```
*Note: If schema modifications were made in `packages/db/src/schema/*.ts`, run `pnpm db:generate` prior to `db:migrate`.*

### Step 3: Verify Master Seed Accounts
Confirm the system administrator account exists:
```bash
cd /Users/shyam18/SEGA/ERP/apps/api
pnpm exec tsx --env-file=../../.env src/seeds/system-admin.ts
```
Default system administrator credentials:
- **Email:** `shyam18@kairo.com`
- **Password:** `Shyam18`

### Step 4: Launch Fastify API Backend
Start the backend server as a daemon process:
```bash
cd /Users/shyam18/SEGA/ERP/apps/api
pnpm dev
# Alternatively in production: pnpm start
```
Verify the server starts listening on `http://0.0.0.0:3000` with:
- `Redis connected`
- `API listening on 0.0.0.0:3000`

### Step 5: Launch Vite Web Frontend
Start the frontend development server as a daemon process:
```bash
cd /Users/shyam18/SEGA/ERP/apps/web
pnpm dev --host
```
Verify the frontend is reachable at `http://localhost:5173/`.

---

## 4. API Calling Contract & Routing Alignment

### Client Architecture (`apps/web/src/api/client.ts`)
1. **Single Axios Instance:** All network calls flow through `export const api = axios.create({ baseURL: '/api', withCredentials: true })`.
2. **Reverse Proxy:** In development, Vite's `server.proxy` forwards all `/api/*` requests from `http://localhost:5173/api/*` to `http://localhost:3000/api/*`.
3. **Authentication Injection:** An Axios request interceptor pulls `accessToken` from the Zustand `useAuthStore` and attaches `Authorization: Bearer <token>`.
4. **401 Silent Token Refresh:** If an access token expires:
   - Request queues in `waitQueue`.
   - Client sends `POST /api/auth/refresh` with the HTTP-only cookie.
   - Upon receiving the refreshed token, pending requests are automatically retried.
5. **Tenant Context Resolution:** Company and Plant selection is bound into the user's JWT via `POST /api/auth/select-context`. If missing or invalid, API returns `409 tenant_context_required`, and client automatically redirects to `/select-company`.

### API Prefix Mapping Table
| Frontend Call Pattern | Backend Route File | Backend Prefix | Purpose |
| :--- | :--- | :--- | :--- |
| `api.post('/auth/*')` | `apps/api/src/routes/auth.ts` | `/api/auth` | Login, logout, refresh, context selection |
| `api.get('/companies/*')` | `apps/api/src/routes/companies.ts` | `/api/companies` | Company & plant discovery |
| `api.get('/settings/*')` | `apps/api/src/routes/settings.ts` | `/api/settings` | Users, roles, COA, tax codes, workflows |
| `api.get('/masters/*')` | `apps/api/src/routes/masters.ts` | `/api/masters` | Suppliers, customers, items, UOM |
| `api.get('/purchase/*')` | `apps/api/src/routes/purchase.ts` | `/api/purchase` | PR, Blanket PO, PO, GRN, LCV, Invoices |
| `api.get('/inventory/*')`| `apps/api/src/routes/inventory.ts`| `/api/inventory`| Stock balances, ledger, adjustments, transfers |
| `api.get('/sales/*')` | `apps/api/src/routes/sales.ts` | `/api/sales` | Quotations, SO, Deliveries, Invoices, FEFO |
| `api.get('/manufacturing/*')`| `apps/api/src/routes/manufacturing.ts`| `/api/manufacturing`| Formulas, Work Orders, Subcontracting |
| `api.get('/accounting/*')`| `apps/api/src/routes/accounting.ts`| `/api/accounting`| Manual JV, Bank Rec, Projects (GAP 8) |
| `api.get('/reports/*')` | `apps/api/src/routes/reports.ts` | `/api/reports` | GL, Stock Ledger, P&L, Aging, KPIs |
| `api.get('/governance/*')`| `apps/api/src/routes/governance.ts`| `/api/governance`| Audit logs, module licensing |
| `api.get('/admin/*')` | `apps/api/src/routes/admin.ts` | `/api/admin` | Platform-level tenant admin |

> [!WARNING]
> Never prepend `/api` to calls made with the Axios `api` instance (e.g. use `api.get('/inventory/stock-balances')`, NOT `api.get('/api/inventory/stock-balances')`). The `baseURL: '/api'` already handles the prefix.

---

## 5. Verification & Health Check Runbook

Execute these automated health checks to verify full operational readiness:

### 1. Direct Backend Health Check
```bash
curl -i http://localhost:3000/health
# Expected: HTTP 200 OK {"status":"ok","ts":"...","env":"development"}
```

### 2. Frontend Server Check
```bash
curl -I http://localhost:5173/
# Expected: HTTP 200 OK (Content-Type: text/html)
```

### 3. Proxied API Gateway Check
```bash
curl -i http://localhost:5173/api/health
# Expected: HTTP 200 OK routed through Vite reverse proxy to Fastify backend
```

### 4. Database Query Test
```bash
cd /Users/shyam18/SEGA/ERP/apps/api
npx tsx --env-file=../../.env -e 'import { db, companies } from "@erp/db"; db.select().from(companies).then(c => { console.log("DB OK, Companies:", c.length); process.exit(0); });'
```

---

## 6. Diagnostic & Troubleshooting Guide

### Issue 1: Port Collision (`EADDRINUSE`)
- **Symptoms:** `listen EADDRINUSE: address already in use 0.0.0.0:3000` or `Port 5173 is already in use`.
- **Diagnosis:**
  ```bash
  lsof -i :3000 -i :5173
  ```
- **Remedy:**
  ```bash
  lsof -ti :3000 | xargs kill -9
  lsof -ti :5173 | xargs kill -9
  ```

### Issue 2: Database Connection Refused (`ECONNREFUSED 127.0.0.1:5433`)
- **Symptoms:** Fastify logs `Connection refused at localhost:5433`.
- **Diagnosis:**
  ```bash
  docker ps -a --filter "name=erp-postgres"
  ```
- **Remedy:**
  ```bash
  docker compose -f docker-compose.dev.yml restart postgres
  docker logs erp-postgres-1 --tail 50
  ```

### Issue 3: Redis Connection Timeout
- **Symptoms:** Fastify crashes with `Redis connection lost` or RBAC checks fail.
- **Diagnosis:**
  ```bash
  nc -zv localhost 6379
  ```
- **Remedy:**
  ```bash
  docker compose -f docker-compose.dev.yml restart redis
  ```

### Issue 4: 409 Tenant Context Required
- **Symptoms:** API calls return HTTP 409 error `tenant_context_required`.
- **Diagnosis:** User logged in but has not yet picked an active company/plant, or the session cookie expired.
- **Remedy:** User must navigate to `http://localhost:5173/select-company` to choose an active company and plant.

### Issue 5: Drizzle Migration Interactive Prompt Hang
- **Symptoms:** Running `drizzle-kit push` hangs waiting for stdin (e.g. system view renames).
- **Diagnosis:** Do not use `db:push` in production or non-interactive shells.
- **Remedy:** Use migration files:
  ```bash
  pnpm --filter @erp/db db:generate
  pnpm --filter @erp/db db:migrate
  ```

---

## 7. Fast Orchestration Cheatsheet

```bash
# 1. Start all infrastructure containers
docker compose -f docker-compose.dev.yml up -d

# 2. Check running status
docker ps

# 3. Apply schema migrations
pnpm db:migrate

# 4. Run full monorepo build test
pnpm turbo build

# 5. Start development servers
# Terminal 1 (API):
pnpm --filter @erp/api dev
# Terminal 2 (Web UI):
pnpm --filter @erp/web dev --host
```

