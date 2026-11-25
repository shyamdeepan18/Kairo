# Kairo ERP — Mission-Critical Modular Enterprise Operating Platform

Kairo is a modular-monolith Enterprise Resource Planning (ERP) platform built with **Fastify, TypeScript, PostgreSQL (Drizzle ORM), and React**. Designed with financial-grade rigor, Kairo enforces double-entry accounting equilibrium, movement-based inventory derivation, and autonomous AI agent operations across discrete and process industries.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Fastify](https://img.shields.io/badge/Fastify-v4-black?style=flat-square&logo=fastify)](https://fastify.dev/)
[![React](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react)](https://react.dev/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791?style=flat-square&logo=postgresql)](https://www.postgresql.org/)
[![Drizzle](https://img.shields.io/badge/ORM-Drizzle-C5F74F?style=flat-square)](https://orm.drizzle.team/)
[![Turborepo](https://img.shields.io/badge/Monorepo-Turborepo-EF4444?style=flat-square&logo=turborepo)](https://turbo.build/)

---

## 🏛️ System Architecture

Kairo is architected as an **independent modular monolith** (Turborepo + pnpm) to eliminate microservice latency and distributed transaction failures:

```
┌─────────────────────────────────────────────────────────────┐
│                       apps/web (React 18)                   │
│   Tailwind CSS • Ant Design • Zustand • Recharts Data Grid   │
└──────────────────────────────┬──────────────────────────────┘
                               │ JSON REST API / JWT
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                       apps/api (Fastify)                    │
│   Multi-Tenant Context Middleware • Status State Machine     │
│   Atomic Posting Engine • Stock Ledger Service • Tax Engine │
└──────────────┬───────────────────────────────┬──────────────┘
               │ Drizzle ORM Transactions      │ Redis Cache
               ▼                               ▼
┌──────────────────────────────┐ ┌────────────────────────────┐
│      packages/db (PG 16)     │ │        Redis Invalidation   │
│  Append-Only Stock Ledger &  │ │   Session & Role Cache      │
│  Balanced Journal Vouchers   │ └────────────────────────────┘
└──────────────────────────────┘
```

---

## 🔒 The Five Non-Negotiable Core Invariants

1. **Movement-Based Inventory:** Stock balances are strictly derived from append-only `stock_ledger_entries`. `quantity_on_hand` is never directly mutated, avoiding race conditions and audit loss.
2. **Double-Entry Equilibrium:** Every inventory movement, bill, and payment writes balanced double-entry journal vouchers ($\sum \text{Debits} = \sum \text{Credits}$). Ledger lines are immutable; adjustments occur via reversal entries.
3. **Multi-Stage Cost Roll-Up:** Valuations dynamically roll up across raw materials, machine runtimes, direct labor absorption, packaging materials, and freight/landed costs.
4. **Atomic Transaction Isolation:** Any operation touching inventory, accounting, or production executes within an ACID database transaction (`Validate → Lock → Execute → SLE Insert → GL Insert → Audit Log → Commit`).
5. **Configurable Modularity:** Multi-industry customization is managed via **Dynamic Industry Blueprints** and runtime module licensing rather than divergent code branches.

---

## 🤖 Agentic AI & Autonomous Operational Skills (`.agents/skills/`)

Kairo integrates native **AI Agent Skills** and diagnostic runbooks directly into the repository to enable autonomous code analysis, self-healing diagnostic procedures, and safe feature development:

| Agent Skill | Purpose & Operational Capability |
|---|---|
| [`erp-accounting-and-gl`](.agents/skills/erp-accounting-and-gl/SKILL.md) | Architectural specifications, posting engine templates, double-entry invariants, and bank reconciliation. |
| [`erp-inventory-and-valuation`](.agents/skills/erp-inventory-and-valuation/SKILL.md) | Weighted Average Cost (WAC) models, batch/FEFO enforcement, and catch-weight dual UOM. |
| [`erp-manufacturing-and-subcontracting`](.agents/skills/erp-manufacturing-and-subcontracting/SKILL.md) | Multi-stage shopfloor routing, cost roll-ups, job work orders, and outward/inward challans. |
| [`erp-purchase-and-p2p`](.agents/skills/erp-purchase-and-p2p/SKILL.md) | Procure-to-Pay lifecycle (Blanket POs, GRN, Landed Cost Vouchers, Returns, Debit Notes). |
| [`erp-sales-and-o2c`](.agents/skills/erp-sales-and-o2c/SKILL.md) | Order-to-Cash lifecycle, real-time stock reservations, Quick POS billing, and credit limits. |
| [`erp-rbac-and-diagnostics`](.agents/skills/erp-rbac-and-diagnostics/SKILL.md) | Diagnostic runbooks for plant/tenant scope resolution, Redis cache invalidation, and DB synchronization. |

---

## 🧪 Deep Verification & Test Coverage

Kairo includes a comprehensive Playwright-based test suite located in [`tests/`](tests/) validating full business cycles and database invariants:

- **22 Integration & Invariant Suites:**
  - Complete Procure-to-Pay (P2P) with partial receipts & 3-way match.
  - Complete Order-to-Cash (O2C) with stock reservations and COGS recognition.
  - Subcontracting & Outside Job Work (GAP 4) with inward fee capitalization.
  - Landed Cost Voucher (GAP 3) with retroactive WAC adjustments.
  - Database Invariants: 100% debit-credit equilibrium checks across all posted journals.

Run all tests:
```bash
pnpm test:regression
```

---

## 🚀 Quickstart & Local Setup

### 1. Prerequisites
- Node.js 20+
- pnpm 9+
- Docker & Docker Compose

### 2. Start Supporting Infrastructure
```bash
docker compose up -d postgres redis
```

### 3. Install Dependencies & Build Packages
```bash
pnpm install
pnpm build
```

### 4. Database Setup
```bash
pnpm db:migrate
```

### 5. Start Development Servers
```bash
pnpm dev
```
- **Web UI:** `http://localhost:5173`
- **Fastify API:** `http://localhost:3000`

---

## 📦 Monorepo Layout

```
├── .agents/skills/            # Agentic AI skills & diagnostic runbooks
├── apps/
│   ├── api/                   # Fastify TypeScript REST API
│   │   ├── src/plugins/       # Error handling, auth, audit, sales plugins
│   │   ├── src/routes/        # Modular route controllers (accounting, sales, purchase, etc.)
│   │   └── src/services/      # Core engines (Posting, Stock Ledger, Status Engine)
│   └── web/                   # React 18 single-page application (Tailwind + Ant Design)
├── packages/
│   ├── db/                    # PostgreSQL Drizzle schemas, migrations, and seeds
│   └── shared/                # Shared Zod validators, TypeScript contracts, and constants
├── tests/                     # Playwright integration, E2E, and financial verification tests
└── docs/                      # Architectural maps, workflows, and QA defect triage reports
```

---

## 📜 License
Proprietary & Confidential. All rights reserved.
