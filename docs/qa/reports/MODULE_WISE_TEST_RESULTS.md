# Module-Wise Test Results

| Module | Submodule / Screen | Test Type | Status | Execution Time | Notes / Key Invariants Validated |
|---|---|---|---|---|---|
| **Authentication** | Login & Context Selection | E2E UI | ✅ Passed | 9.9s | Multi-plant selector, token issuance, session storage |
| **Authentication** | Credential Validation | E2E UI Negative | ✅ Passed | 784ms | Rejects invalid credentials, displays alert |
| **Purchasing (P2P)** | Supplier Master | Integration API | ✅ Passed | 25ms | GSTIN validation, vendor code generation |
| **Purchasing (P2P)** | Purchase Order | Integration API | ✅ Passed | 35ms | Multi-line calculation, state transition |
| **Purchasing (P2P)** | Goods Receipt Note | Integration API & DB | ✅ Passed | 60ms | Inward SLE written, WAC recalculated, GL balanced |
| **Purchasing (P2P)** | Purchase Invoice | Integration API & DB | ✅ Passed | 40ms | 3-way match, AP liability posted |
| **Purchasing (P2P)** | Vendor Payment | Integration API & DB | ✅ Passed | 30ms | Invoice allocation, bank account credited |
| **Sales (O2C)** | Customer Master | Integration API | ✅ Passed | 20ms | Credit limits, payment terms |
| **Sales (O2C)** | Sales Order | Integration API & DB | ✅ Passed | 55ms | Stock reservation row generated |
| **Sales (O2C)** | Delivery Challan | Integration API & DB | ✅ Passed | 70ms | Outward SLE written at WAC, reservation released |
| **Sales (O2C)** | Sales Invoice | Integration API & DB | ✅ Passed | 45ms | Revenue recognition, AR debit, Output GST |
| **Sales (O2C)** | Customer Receipt | Integration API & DB | ✅ Passed | 35ms | Cash/Bank debited, AR credited |
| **Manufacturing** | Outside Job Work (GAP 4) | Integration API | ⚠️ Defect Caught | 69ms | JWO created; BUG-001 caught on submission |
| **Accounting** | Manual Journal Voucher | Integration API & DB | ✅ Passed | 56ms | Double-entry Dr == Cr verified in PostgreSQL |
| **Accounting** | Unbalanced JV Check | Integration API Negative | ✅ Passed | 14ms | Rejects unbalanced lines with HTTP 400 |
| **Accounting** | Project Accounting (GAP 8) | Integration API | ✅ Passed | 30ms | Live BvA cost margin summary calculated |
| **Database Tier** | Ledger Equilibrium | Direct DB Query | ✅ Passed | 12ms | Zero unbalanced vouchers across entire DB |
| **Database Tier** | Stock Movement Truth | Direct DB Query | ✅ Passed | 2ms | Inward rates > 0, valid movement types |
| **Database Tier** | Multi-Tenant Isolation | Direct DB Query | ✅ Passed | 2ms | Zero orphan or cross-tenant records |
| **Database Tier** | Audit Trail Compliance | Direct DB Query | ✅ Passed | 1ms | 100% vouchers carry creator UUID & fiscal year |

