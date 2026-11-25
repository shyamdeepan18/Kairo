---
name: regression-testing
description: Continuous regression testing strategy, module-wise coverage matrix, and CI/CD quality gate enforcement for Kairo ERP.
---

# Regression Testing & Quality Gates Skill

## 1. Skill Purpose
Defines regression suites, module-wise test execution boundaries, and criteria for safe code deployment.

## 2. Regression Suites
- **Smoke Suite:** `npm run test:smoke` (Executed on every commit; < 15 seconds).
- **Core Business Cycle Suite:** `npm run test:p2p && npm run test:o2c && npm run test:subcontracting` (< 10 seconds).
- **Full Database & Invariant Suite:** `npm test` (< 20 seconds).

## 3. Reference Files
- [Regression Strategy Runbook](file:///Users/shyam18/SEGA/qa-skills/regression-testing/regression-strategy.md)
- [Test Coverage Matrix](file:///Users/shyam18/SEGA/qa-skills/regression-testing/regression-matrix.md)

