# Kairo ERP

Kairo is a modern, highly scalable, multi-tenant Enterprise Resource Planning (ERP) application. It is built to handle complex operations across Accounting, Inventory Management, Manufacturing, Sales, and Purchasing while ensuring strict data separation between tenant companies.

## 🚀 Tech Stack

Kairo is built inside a modern **Monorepo** architecture using Turborepo and `pnpm` workspaces.

### Frontend (`apps/web`)
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite
- **UI Component Library**: Ant Design (antd)
- **State Management**: Zustand
- **Styling**: Vanilla CSS (CSS Variables) with dynamic Light/Dark mode

### Backend (`apps/api`)
- **Framework**: Fastify (Node.js)
- **Language**: TypeScript
- **Authentication**: JWT-based secure authentication with Argon2 hashing

### Database & ORM (`packages/db`)
- **Database**: PostgreSQL (Dockerized)
- **ORM**: Drizzle ORM
- **Migrations**: Handled via Drizzle Kit

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

## 🛠️ Getting Started

### Prerequisites
- Node.js (v18+)
- `pnpm` (v9+)
- Docker (for PostgreSQL database)

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
   Create a `.env` file in the root directory (based on `.env.example` if available). At a minimum, you will need:
   ```env
   DATABASE_URL=postgres://postgres:postgres@localhost:5432/erp
   JWT_SECRET=your_super_secret_jwt_key
   ```

4. **Initialize Database Schema**
   ```bash
   pnpm db:push
   ```

5. **Seed Initial Data (Admin & Master Data)**
   ```bash
   pnpm db:seed
   ```

6. **Start the Development Servers**
   ```bash
   pnpm dev
   ```

The frontend will be accessible at `http://localhost:5173` and the API server at `http://localhost:3000`.

## 🔐 System Admin Portal

To access the System Admin portal (to provision new companies, plants, and users), log in using the seed admin credentials:
- **Username**: `shyam18@kairo.com`
- **Password**: `Shyam18`

> **Note:** Make sure to change the default admin password after your first login!

## 🧩 Core Modules

- **Admin Portal**: Tenant, license, role, and plant provisioning.
- **Accounting**: General Ledger, Chart of Accounts, Journal Vouchers, Financial Reporting.
- **Inventory**: Real-time stock tracking, Multi-warehouse management, Stock adjustments, and transfers.
- **Manufacturing**: Bills of Material (BOM), Work Centres, Production Orders, Cost Roll-up.
- **Purchasing**: Purchase Requisitions, Purchase Orders, Goods Receipt (GRN), Supplier Invoicing.
- **Sales**: Quotations, Sales Orders, Deliveries, Sales Invoicing.

## 📝 License

Proprietary Software. All rights reserved.
