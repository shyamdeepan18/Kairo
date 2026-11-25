# BUG-001: Missing Status Transition Definition for Subcontracting Job Work Order (JWO)

**Bug ID:** BUG-001  
**Title:** Status Engine rejects `draft → submitted` transition on `manufacturing.job_work_order` with terminal state error  
**Module:** Manufacturing & Subcontracting  
**Submodule:** Outside Job Work (GAP 4)  
**Business Process:** Subcontracting Lifecycle  
**Severity:** Critical (Blocks entire Subcontracting execution pipeline)  
**Priority:** High  
**Defect Category:** Backend Business Logic / State Machine Configuration  
**Environment:** Development / Local Test Sandbox  
**Application Version:** 2.0  
**Status:** **RESOLVED & VERIFIED**  
**Test Scenario ID:** `tests/integration/api/subcontracting-api.spec.ts`  

---

## 1. SUMMARY
When a user or automated test creates a Subcontracting Job Work Order (`job_work_orders`) and attempts to submit it via `POST /api/manufacturing/job-work-orders/:id/submit`, the server responds with HTTP 409 Conflict: `{"error":"Transition failed","detail":"Invalid transition for manufacturing.job_work_order: draft → submitted. Allowed: none (terminal state)"}`.

---

## 2. BUSINESS CONTEXT
Subcontracting (Outside Job Work, GAP 4) is an essential capability for manufacturing enterprises that outsource specialized operations (heat treatment, electroplating, machining, slitting). Before raw materials can be dispatched to a subcontractor via an Outward Challan (`job_work_challans`), the Job Work Order must be submitted and approved by production managers. Because the state transition fails, no JWO can ever reach `approved` or `in_progress`, permanently blocking all material dispatch and receipt.

---

## 3. PRECONDITIONS
1. Valid company, plant, and warehouse exist.
2. A supplier master marked as a subcontractor exists.
3. Raw material and target output items exist.
4. A Job Work Order is created in `draft` status.

---

## 4. TEST DATA
- `plantId`: Valid UUID (`0e2ad5ed-14c3-4036-98ce-bed2c9e378c2`)
- `vendorId`: Subcontractor Supplier UUID
- `targetItemId`: Processed FG Item UUID
- `targetQty`: 10
- `materials`: `[{ itemId: "<raw_item_uuid>", plannedQty: 10, uom: "NOS" }]`
- `status`: `draft`

---

## 5. REPRODUCTION STEPS
1. Authenticate as an authorized user (`shyam18@kairo.com`).
2. Select tenant and plant context via `POST /api/auth/select-context`.
3. Create a draft JWO via `POST /api/manufacturing/job-work-orders`.
4. Capture the generated `jwo.id`.
5. Call `POST /api/manufacturing/job-work-orders/${jwo.id}/submit` with `{}`.

---

## 6. EXPECTED RESULT
The server should accept the transition, update the document status from `draft` to `submitted`, populate `submitted_by` and `submitted_at`, and return HTTP 200 `{ ok: true, status: 'submitted' }`.

---

## 7. ACTUAL RESULT
The server responds with HTTP 409 Conflict:
```json
{
  "error": "Transition failed",
  "detail": "Invalid transition for manufacturing.job_work_order: draft → submitted. Allowed: none (terminal state)"
}
```

---

## 8. REPRODUCIBILITY
100% reproducible on every execution.

---

## 9. EVIDENCE
- **HTTP Endpoint:** `POST /api/manufacturing/job-work-orders/:id/submit`
- **Response Status:** 409 Conflict
- **Response Body:**
  ```json
  {"error":"Transition failed","detail":"Invalid transition for manufacturing.job_work_order: draft → submitted. Allowed: none (terminal state)"}
  ```
- **Execution Log:** `test-results/integration-api-subcontrac-008b2-Receipt-Cost-Capitalization-chromium/`

---

## 10. TECHNICAL INVESTIGATION
- **Route Definition:** `ERP/apps/api/src/routes/manufacturing.ts` (lines 665, 814):
  ```ts
  const JWO_DOC = 'manufacturing.job_work_order';
  simpleTransition(app, { route: '/job-work-orders/:id/submit', table: jobWorkOrders, docType: JWO_DOC, to: 'submitted', perm: 'manufacturing.order.create' });
  ```
- **State Machine Definition:** `ERP/apps/api/src/services/status-engine.ts`:
  In `DOCUMENT_TRANSITIONS`, the dictionary defines valid transitions for:
  - `purchase.requisition`, `purchase.po`, `purchase.grn`, `purchase.invoice`, `purchase.payment`
  - `sales.quotation`, `sales.so`, `sales.delivery`, `sales.invoice`, `sales.receipt`
  - `manufacturing.order`
  However, `'manufacturing.job_work_order'` is **completely omitted**.
- Because `'manufacturing.job_work_order'` is not a key in `DOCUMENT_TRANSITIONS`, `StatusEngine.allowedTransitions(documentType, fromStatus)` returns an empty array `[]`, treating `draft` as a terminal state.

---

## 11. ROOT CAUSE
The document type identifier `'manufacturing.job_work_order'` used by the Subcontracting endpoints was never registered in the `DOCUMENT_TRANSITIONS` configuration map in `ERP/apps/api/src/services/status-engine.ts`.

---

## 12. IMPACT ANALYSIS
- **Affected Module:** Manufacturing / Subcontracting.
- **Affected Business Workflow:** Outside Job Work lifecycle.
- **Downstream Impact:** Outward Subcontracting Challan (`job_work_challans`) requires `jwo.status IN ('approved', 'in_progress')`. Since approval is blocked, challans and inward receipts cannot be processed.
- **Data Integrity Risk:** None (transaction rolled back safely).
- **Financial Impact:** Subcontracting service charges and WIP capitalization cannot be booked.

---

## 13. SUGGESTED FIX
In `ERP/apps/api/src/services/status-engine.ts`, register `'manufacturing.job_work_order'` in the `DOCUMENT_TRANSITIONS` map:
```ts
  'manufacturing.job_work_order': {
    draft: ['submitted', 'cancelled'],
    submitted: ['approved', 'rejected', 'draft'],
    rejected: ['draft'],
    approved: ['in_progress', 'completed', 'cancelled'],
    in_progress: ['completed', 'cancelled'],
    completed: [],
    cancelled: [],
  },
```

---

## 14. REGRESSION TEST CASES
- `tests/integration/api/subcontracting-api.spec.ts`: Validates JWO draft $\to$ submit $\to$ approve $\to$ challan $\to$ inward receipt.
- Negative transition test: Verifying that `approved → draft` without cancellation is rejected.

---

## 15. AI FIX INSTRUCTIONS
- **Target File:** `ERP/apps/api/src/services/status-engine.ts`
- **Location:** Inside `DOCUMENT_TRANSITIONS` object around line 178.
- **Action:** Add `'manufacturing.job_work_order'` state transition rules:
  ```ts
  'manufacturing.job_work_order': {
    draft: ['submitted', 'cancelled'],
    submitted: ['approved', 'rejected', 'draft'],
    rejected: ['draft'],
    approved: ['in_progress', 'completed', 'cancelled'],
    in_progress: ['completed', 'cancelled'],
    completed: [],
    cancelled: [],
  },
  ```
- **Acceptance Criteria:**
  1. `POST /api/manufacturing/job-work-orders/:id/submit` returns HTTP 200 with `{ ok: true, status: 'submitted' }`.
  2. `POST /api/manufacturing/job-work-orders/:id/approve` returns HTTP 200 with `{ ok: true, status: 'approved' }`.
  3. `tests/integration/api/subcontracting-api.spec.ts` passes cleanly.

