# Kairo ERP Kickstart Guide (For AI & Developers)

This guide documents the strict order of operations required to completely bootstrap, provision, and start the Kairo ERP application from scratch.

> **AI Instruction**: Before running the application for the user, read through these steps and verify that all prerequisites (like `.env`, `docker`, and `pnpm install`) are satisfied. Only proceed to start the app when the database is properly migrated and seeded.

---

## 1. Prerequisites

- **Node.js** and **pnpm** installed.
- **Docker** and **Docker Compose** installed and running.
- **Environment Variables**: Ensure a `.env` file exists at the root of the project (copy from `.env.example`).
  - *Crucial Check*: For local development, `DATABASE_URL` must point to `postgresql://erp:erp_dev@localhost:5433/erp_db`.
  - Ensure `JWT_SECRET` is set.

## 2. Infrastructure (Postgres & Redis)

Start the development database and Redis cache using the dedicated dev compose file.

```bash
# From the project root
docker compose -f docker-compose.dev.yml up -d
```

*Wait a few seconds after running this command to ensure Postgres is healthy before attempting to run migrations.*

## 3. Install and Build

Install all monorepo dependencies and build the database package. (The database package must be built for `drizzle-kit` and other scripts to recognize schema changes).

```bash
pnpm install
cd packages/db && pnpm run build && cd ../..
```

## 4. Database Migrations

Apply the latest schema changes to the database.

```bash
pnpm db:migrate
```

*Troubleshooting note*: If the schema is fundamentally broken or you need a complete wipe in development, you can drop the schema first:
`psql $DATABASE_URL -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"` (Note: ensure you export `$DATABASE_URL` first).

## 5. Database Seeding

The application requires master data to function (COA, Permissions, Users, Company). **These seeds must be run from the `apps/api` directory** so that local dependencies (like `argon2`) can be resolved.

Run the following commands sequentially:

```bash
# Load env vars into the current session to ensure the seeds connect to the DB
set -a; source .env; set +a;

cd apps/api

# 1. Create the system admin account (shyam18@kairo.com / Shyam18)
npx tsx ../../packages/db/src/seeds/system-admin.ts

# 2. Create the dummy company and default settings/cost groups
npx tsx ../../packages/db/src/seeds/seed-company.ts

# 3. Seed Chart of Accounts and link posting categories to the company
npx tsx ../../packages/db/src/seeds/run-coa.ts

# 4. Create document number series (Invoices, Orders, etc)
npx tsx ../../packages/db/src/seeds/number-series.ts

# 5. Create default GST Tax Codes
npx tsx ../../packages/db/src/seeds/tax-codes.ts

# 6. Create standard Unit of Measures (UOMs)
npx tsx ../../packages/db/src/seeds/uom.ts

# 7. Seed RBAC permissions and system roles (Admin, HR Manager, etc)
npx tsx ../../packages/db/src/seeds/permissions.ts

cd ../..
```

## 6. Start the Application

Once the infrastructure is up, schemas are migrated, and data is seeded, you can start the development servers.

```bash
# From the project root
pnpm dev
```

The application will be available at `http://localhost:5173` (Vite Frontend) and the API will run on `http://localhost:3000`.

---
**Credentials for Testing:**
- **Email:** `shyam18@kairo.com`
- **Password:** `Shyam18`

---
## 7. Note on Manual Running (Step-by-Step)

If you need to manually run the application or restart specific services individually, you can bypass `pnpm dev` (which uses Turbo) and run the dev scripts directly in each workspace. 

You will need **two separate terminal windows** for this.

### Terminal 1: Run the Backend API

1. Open your terminal and navigate to the project root (`/Users/shyam18/SEGA/ERP`).
2. Load the environment variables from the `.env` file so the API can connect to the database.
   ```bash
   set -a; source .env; set +a;
   ```
3. Navigate into the API workspace:
   ```bash
   cd apps/api
   ```
4. Start the API development server:
   ```bash
   pnpm dev
   ```
   *The API will start running on `http://localhost:3000`.*

### Terminal 2: Run the Frontend (Web)

1. Open a **new** terminal window and navigate to the project root.
2. Navigate into the Web workspace:
   ```bash
   cd apps/web
   ```
3. Start the Vite development server:
   ```bash
   pnpm dev
   ```
   *The frontend will start running on `http://localhost:5173`.*
