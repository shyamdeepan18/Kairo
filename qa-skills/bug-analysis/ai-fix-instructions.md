# AI-Assisted Defect Fix Workflow Guide

When an AI coding agent is tasked with fixing a defect documented in `docs/qa/BUG_REPORTS/`:

## Fix Lifecycle Protocol
1. **Read Defect Report:**
   Load the target bug report (e.g. `docs/qa/BUG_REPORTS/BUG-001-JWO-TRANSITION-MISSING.md`).
2. **Review Section 15 (AI FIX INSTRUCTIONS):**
   Examine target files, component/function names, expected behavior, and constraints.
3. **Reproduce Failure First:**
   Execute the linked test scenario before modifying code:
   ```bash
   npx playwright test tests/integration/api/subcontracting-api.spec.ts
   ```
4. **Implement Surgical Fix:**
   - Adhere strictly to User Rule 2 & 3: Modify ONLY the defective logic.
   - Do NOT refactor surrounding code, rewrite modules, or remove DB constraints.
5. **Execute Regression Verification:**
   Run both the specific test and related cross-module suites:
   ```bash
   npm run test:subcontracting
   npm run test:integration
   npm test
   ```
6. **Update Bug Report:**
   Mark the bug as resolved with commit details, verification timestamp, and test evidence.

