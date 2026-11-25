---
name: erp-business-workflows
description: Detailed operational workflows, state machines, accounting postings, and mathematical invariant formulas for P2P, O2C, Subcontracting, and Manufacturing.
---

# Kairo ERP Business Workflows Skill

## 1. Skill Purpose
Provides step-by-step business transaction procedures, document status state machines, and mathematical formulas required to validate end-to-end workflows.

## 2. Invariant Rules
1. **State Machine Transitions:**
   Documents never jump directly from `draft` to `approved`. They MUST follow:
   `draft` $\longrightarrow$ `submitted` $\longrightarrow$ `approved`.
2. **Moving Weighted Average Cost (WAC):**
   $$\text{New WAC} = \frac{(Q_{\text{old}} \times \text{WAC}_{\text{old}}) + (Q_{\text{in}} \times \text{Rate}_{\text{in}})}{Q_{\text{old}} + Q_{\text{in}}}$$
3. **Double-Entry Equilibrium:**
   Every posted journal entry must satisfy: $\sum \text{Debits} = \sum \text{Credits}$.

## 3. Workflow Files
- [P2P Workflow Guide](file:///Users/shyam18/SEGA/qa-skills/erp-business-workflows/p2p-workflow.md)
- [O2C Workflow Guide](file:///Users/shyam18/SEGA/qa-skills/erp-business-workflows/o2c-workflow.md)
- [Subcontracting Workflow Guide](file:///Users/shyam18/SEGA/qa-skills/erp-business-workflows/subcontracting-workflow.md)

