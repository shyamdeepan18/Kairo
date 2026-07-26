# Kairo ERP

> **🤖 NOTE FOR AI ASSISTANTS & DEVELOPERS:**
> Before inspecting, modifying, or creating code in this workspace, **you MUST read and adhere strictly to the rules, setup steps, architectural patterns, and database guidelines listed in this README.**

Kairo is a modern, highly scalable, multi-tenant Enterprise Resource Planning (ERP) application. It is built to handle complex operations across Accounting, Inventory Management, Manufacturing, Sales, and Purchasing while ensuring strict data separation between tenant companies.

---

## 📌 Non-Negotiable Core ERP Principles

When developing or modifying features in this codebase, **always maintain these core constraints**:

1. **Movement-Based Inventory**:
   * Never directly modify stock quantities or `on_hand` fields.
   * All inventory changes MUST insert into `inventory_movements` inside an atomic DB transaction.
2. **Double-Entry Accounting & Ledger Integrity**:
   * Accounting entries must maintain Debit = Credit equality.
   * Never delete or update posted journal entry lines; use reversal entries.
3. **Segregation of Duties (SoD)**:
   * A document creator or submitter CANNOT approve their own document unless they explicitly possess the `system.bypass_sod` permission (e.g., the Owner role).
4. **Strict Document Flow Integrity**:
   * **Purchasing Flow**: Requisition (PR) ➔ Purchase Order (PO) ➔ Goods Receipt (GRN) ➔ AP Invoice
   * **Sales Flow**: Quotation ➔ Sales Order (SO) ➔ Delivery Note (DN) ➔ Sales Invoice

---

## 🚀 Tech Stack

Kairo is built inside a modern **Monorepo** architecture using Turborepo and `pnpm` workspaces.

### Frontend (`apps/web`)
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite
- **UI Component Library**: Ant Design (`antd`)
- **State Management**: Zustand
- **Styling**: Vanilla CSS (CSS Variables) with dynamic Light/Dark mode

### Backend (`apps/api`)
- **Framework**: Fastify (Node.js)
- **Language**: TypeScript
- **Authentication**: JWT-based secure authentication with Argon2 / bcrypt hashing

### Database & ORM (`packages/db`)
- **Database**: PostgreSQL (Dockerized)
- **ORM**: Drizzle ORM
- **Migrations**: Handled via Drizzle Kit

---

## 🏗️ Project Structure

```
├── apps/
│   ├── api/       # Fastify REST API backend
│   └── web/       # React frontend application
├── packages/
│   ├── db/        # Drizzle ORM schemas, seeds, and migrations
│   └── shared/    # Shared types, Zod validators, and constants
├── AI files/      # AI-generated design documents and planning notes
└── docker-compose.yml # PostgreSQL database infrastructure
```

---

## 🛠️ Getting Started

### Prerequisites
- **Node.js**: v18+
- **pnpm**: v9+ (`npm install -g pnpm`)
- **Docker & Docker Desktop**: For running PostgreSQL database

### Installation & Setup

1. **Install Dependencies**
   ```bash
   pnpm install
   ```

2. **Start the Database**
   ```bash
   docker compose up -d
   ```

3. **Configure Environment Variables**
   Create a `.env` file in the root directory (based on `.env.example`):
   ```env
   DATABASE_URL=postgres://postgres:postgres@localhost:5432/erp
   JWT_SECRET=your_super_secret_jwt_key
   ```

4. **Initialize Database Schema & Run Migrations**
   ```bash
   pnpm db:migrate
   ```

5. **Seed Initial Data (Admin Accounts & Roles)**
   ```bash
   pnpm --filter @erp/db seed
   ```

6. **Start Development Servers**
   ```bash
   pnpm dev
   ```

The frontend will be accessible at `http://localhost:5173` and the API server at `http://localhost:3000`.

---

## 🔐 System Admin Credentials

To access the System Admin portal (to provision new companies, plants, and users), log in using the seed admin credentials:
- **Username / Email**: `shyam18@kairo.com`
- **Password**: `Shyam18`

---

## 🧹 Clearing Transactional Data (Keeping Admin Accounts)

If you need to wipe out test transactional data (orders, invoices, receipts, stock movements) while preserving admin logins and master configurations, run:

### Command Line Script:
```bash
pnpm tsx apps/api/src/scripts/reset-all-data.ts
```

### Direct SQL Query (via psql or Drizzle Studio):
```sql
TRUNCATE TABLE 
  inventory_movements,
  stock_ledger,
  journal_entry_lines,
  journal_entries,
  sales_invoice_lines,
  sales_invoices,
  delivery_note_lines,
  delivery_notes,
  sales_order_lines,
  sales_orders,
  sales_quotation_lines,
  sales_quotations,
  ap_invoice_lines,
  ap_invoices,
  grn_lines,
  goods_receipt_notes,
  purchase_order_lines,
  purchase_orders,
  purchase_requisition_lines,
  purchase_requisitions,
  customer_receipts,
  supplier_payments,
  approval_actions,
  approval_requests
CASCADE;
```

---

## 🧩 Core Modules

- **Admin Portal**: Tenant, license, role, and plant provisioning.
- **Accounting**: General Ledger, Chart of Accounts, Journal Vouchers, Financial Reporting (AP/AR Aging).
- **Inventory**: Real-time stock tracking, Multi-warehouse management, Stock adjustments, and transfers.
- **Manufacturing**: Bills of Material (BOM), Work Centres, Production Orders, Cost Roll-up.
- **Purchasing**: Purchase Requisitions, Purchase Orders, Goods Receipt (GRN), Supplier Invoicing.
- **Sales**: Quotations, Sales Orders, Deliveries, Sales Invoicing.

---

## 📝 License

Proprietary Software. All rights reserved.
