# Kairo ERP — Autonomous QA Intelligence & Skills Repository

## 1. Overview & Core Philosophy

This directory contains the persistent, token-optimized **AI QA Intelligence Knowledge Base** for Kairo ERP.
Its purpose is to eliminate repetitive exploratory analysis by AI agents in subsequent sessions, minimizing token consumption while maximizing testing depth and accuracy.

Every skill provides:
1. Architectural & transactional ground truth.
2. Direct CLI and programmatic execution procedures.
3. Pre-validated test data templates and assertions.
4. Runbooks for diagnosing failures and classifying defects.

---

## 2. Skill Directory Structure

```
qa-skills/
  README.md                 # Master directory index & AI loading guidelines
  SKILL_INDEX.md            # Task-to-skill selector matrix (Token Optimization)

  erp-application-knowledge/ # Tech stack, schema topology, API conventions
    SKILL.md
    application-architecture.md
    module-inventory.md
    database-schema.md
    api-reference.md

  erp-business-workflows/   # SOPs, state transitions, mathematical models
    SKILL.md
    p2p-workflow.md
    o2c-workflow.md
    subcontracting-workflow.md

  erp-module-testing/       # Module-specific test matrices & edge cases
    SKILL.md
    purchasing-tests.md
    sales-tests.md
    inventory-tests.md
    finance-tests.md

  playwright-automation/    # Playwright architecture, fixtures, locators
    SKILL.md
    automation-standards.md
    reusable-components.md
    selector-strategy.md
    execution-guide.md

  bug-analysis/             # Defect triage, RCA heuristics, AI fix templates
    SKILL.md
    bug-report-template.md
    root-cause-analysis.md
    ai-fix-instructions.md

  regression-testing/       # Test suites, execution commands, CI/CD gates
    SKILL.md
    regression-strategy.md
    regression-matrix.md
```

---

## 3. Token-Optimized AI Agent Usage Rules

When an AI Agent is invoked to perform a testing or debugging task:
1. **DO NOT load all skills into context.** Doing so wastes context tokens and degrades attention focus.
2. **Consult `SKILL_INDEX.md` first** to identify the minimum viable set of skills required for the assigned task.
3. **Load only the corresponding `SKILL.md`** and relevant reference files.
4. **Preserve invariants:** Every test or fix MUST uphold the 5 ERP Core Invariants:
   - Append-only movement-based stock ledger (`stock_ledger_entries`).
   - Append-only double-entry general ledger ($\sum \text{Dr} = \sum \text{Cr}$).
   - Multi-stage cost roll-up.
   - Atomic database transactions.
   - Strict tenant and plant isolation.

