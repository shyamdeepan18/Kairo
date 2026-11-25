# Playwright Automation Execution Guide

## 1. Quick CLI Execution Commands

Execute tests directly from `/Users/shyam18/SEGA`:

```bash
# Full Regression Suite (All modules, integration, invariants)
npm test

# Module-Specific Suites
npm run test:smoke           # UI login and navigation smoke check
npm run test:p2p             # Procure-to-Pay full lifecycle & GL validation
npm run test:o2c             # Order-to-Cash full lifecycle & stock reservation
npm run test:subcontracting  # Subcontracting & Outside Job Work (GAP 4)
npm run test:integration     # Fastify API & PostgreSQL invariant test suites
npm run test:e2e             # Browser UI end-to-end tests

# View Visual HTML Report
npm run test:report
```

---

## 2. Headed & Debug Mode
To run with a live browser window for interactive debugging:
```bash
npx playwright test tests/e2e/smoke.spec.ts --headed
```

To run a specific test file with detailed Playwright tracing:
```bash
npx playwright test tests/integration/api/p2p-api.spec.ts --trace on
```

To inspect recorded failure traces:
```bash
npx playwright show-trace test-results/.../trace.zip
```

---

## 3. Environment Configuration
Tests automatically read connection parameters from `ERP/.env`:
- `API_URL`: Fastify server endpoint (`http://localhost:3000/api`)
- `FRONTEND_URL`: Vite web application endpoint (`http://localhost:5173`)
- `DATABASE_URL`: PostgreSQL connection string (`postgresql://erp:erp_dev@localhost:5433/erp_db`)

