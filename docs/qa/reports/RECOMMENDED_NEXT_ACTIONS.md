# Recommended Next Actions & QA Roadmap

## 1. Immediate Next Actions (Sprint Priority)

1. **Remediate BUG-001 (Subcontracting JWO Transition):**
   - Apply the surgical one-line fix in `ERP/apps/api/src/services/status-engine.ts` to register `'manufacturing.job_work_order'` in `DOCUMENT_TRANSITIONS`.
   - Run `npm run test:subcontracting` to verify outward challan and inward cost capitalization.
2. **Expand UI Page Objects for Granular Form Filling:**
   - Expand `PurchaseOrdersPage.ts`, `GrnPage.ts`, `SalesOrdersPage.ts`, `DeliveriesPage.ts` to execute end-to-end multi-line form submission directly through the browser UI, complementing the existing high-speed API integration suites.
3. **Automate Landed Cost Voucher (LCV - GAP 3) Integration Test:**
   - Write `tests/integration/api/lcv-api.spec.ts` to test post-GRN freight capitalization into WAC and retroactive COGS adjustment.
4. **Automate Automated FEFO Batch Expiry Enforcement (GAP 5):**
   - Write test asserting rejection of expired batches during delivery approval.
5. **CI/CD Quality Gate Integration:**
   - Add `npm test` into GitHub Actions or GitLab CI pipeline so no pull request can merge if debit $\ne$ credit or if inventory movements fail.

