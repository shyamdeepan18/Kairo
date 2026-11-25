---
name: erp-application-knowledge
description: Master architectural guide, tech stack reference, database schemas, and Fastify API endpoint directory for Kairo ERP.
---

# Kairo ERP Application Knowledge Skill

## 1. Skill Metadata
- **Domain:** System Architecture, Technical Stack, Tenancy Model & Database Schemas
- **When to Use:** When configuring test environments, locating database tables, identifying API routes, understanding tenant/plant scoping, or writing new automation fixtures.
- **Required Inputs:** Target environment URL (default: `http://localhost:5173`), API URL (`http://localhost:3000/api`), DB URL (`postgresql://erp:erp_dev@localhost:5433/erp_db`).
- **Expected Output:** Reliable execution context and accurate table/API targets.

---

## 2. Fast Reference Links
- [Application Architecture](file:///Users/shyam18/SEGA/qa-skills/erp-application-knowledge/application-architecture.md)
- [Module Inventory](file:///Users/shyam18/SEGA/qa-skills/erp-application-knowledge/module-inventory.md)
- [Database Schema Reference](file:///Users/shyam18/SEGA/qa-skills/erp-application-knowledge/database-schema.md)
- [API Reference](file:///Users/shyam18/SEGA/qa-skills/erp-application-knowledge/api-reference.md)

---

## 3. Core Architectural Ground Truth
1. **Frontend:** React 18 with Vite, Tailwind CSS v4 utility classes, Ant Design 5 primitives, Zustand state management.
2. **Backend:** Fastify v4 in TypeScript, stateless JWT auth with 15-minute access tokens and 7-day httpOnly refresh cookies.
3. **Database:** PostgreSQL 16 on port 5433 (`erp_db`), Drizzle ORM v0.30.10.
4. **Cache & Session:** Redis 7 on port 6379.
5. **Tenancy:** Every operational table contains `company_id`. Context is chosen via `POST /api/auth/select-context` and encoded into the JWT claim `activeCompanyId`. Downstream routes enforce this via `resolveTenantContext` middleware.

