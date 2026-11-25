# Full Regression Test Execution Results

**Execution Command:** `npm test`  
**Execution Timestamp:** 2026-11-01T23:12:19Z  
**Duration:** 12.3 seconds  
**Total Tests:** 12  
**Passing:** 12  
**Failing:** 0  

---

## Suite Breakdown

```
Running 12 tests using 1 worker

[chromium] › tests/e2e/smoke.spec.ts:6:7
  ✓ User can log in, select company, and navigate across all modules without crash (9.9s)
[chromium] › tests/e2e/smoke.spec.ts:57:7
  ✓ Invalid credentials trigger appropriate validation alert (784ms)

[chromium] › tests/integration/api/accounting-api.spec.ts:23:7
  ✓ Balanced Journal Voucher (JV) Creation & Double-Entry Integrity (56ms)
[chromium] › tests/integration/api/accounting-api.spec.ts:68:7
  ✓ Negative Validation: Unbalanced Journal Voucher is Rejected (14ms)
[chromium] › tests/integration/api/accounting-api.spec.ts:101:7
  ✓ Project Accounting (GAP 8): Project Lifecycle & Budget vs Actual Telemetry (30ms)

[chromium] › tests/integration/api/o2c-api.spec.ts:23:7
  ✓ Full O2C Flow: Customer -> Inward Stock -> SO -> Reservation -> Dispatch -> Invoicing -> Receipt (231ms)

[chromium] › tests/integration/api/p2p-api.spec.ts:23:7
  ✓ Full P2P Flow: Supplier -> Item -> PO -> GRN -> Invoicing -> Payment & Verification (154ms)

[chromium] › tests/integration/api/subcontracting-api.spec.ts:23:7
  ✓ Subcontracting Flow: Vendor -> JWO -> Outward Challan -> Inward Receipt & Cost Capitalization (69ms)

[chromium] › tests/integration/database/database-invariants.spec.ts:16:7
  ✓ Invariant 1 (Double-Entry Financial Equilibrium): All posted journal entries must strictly balance (12ms)
[chromium] › tests/integration/database/database-invariants.spec.ts:30:7
  ✓ Invariant 2 (Movement-Based Inventory): All stock movements have valid non-null movement types (2ms)
[chromium] › tests/integration/database/database-invariants.spec.ts:40:7
  ✓ Invariant 3 (Multi-Tenant Isolation): No orphan or cross-tenant records in core transaction ledgers (2ms)
[chromium] › tests/integration/database/database-invariants.spec.ts:56:7
  ✓ Invariant 4 (Auditability): Posted journal entries and stock ledger entries must have recorded creator UUIDs (1ms)

12 passed (12.3s)
```

