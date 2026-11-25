---
name: bug-analysis
description: Defect triage methodology, root-cause analysis (RCA) heuristics, defect classification, and structured AI fix instruction generation for Kairo ERP.
---

# Defect Triage & Bug Analysis Skill

## 1. Skill Purpose
Guides QA engineers and AI coding agents in systematically investigating test failures, differentiating between script errors and genuine business defects, and generating developer-ready, AI-actionable bug reports.

## 2. Defect Classification Heuristics
When a test fails, evaluate against this hierarchy before filing a bug:
1. **Application Bug:** The implementation deviates from ERP business rules (e.g. missing transition in `DOCUMENT_TRANSITIONS`, unbalanced journal lines written to DB, unreleased reservations).
2. **Automation Script Defect:** The test asserted wrong response field, used an incorrect selector, or failed to perform prerequisite setup.
3. **Environment Failure:** Database or Redis container is unreachable, ports colliding, or network timed out.
4. **Expected Business Validation:** The application correctly rejected invalid input, credit limit breach, or locked period. This is an expected validation, NOT a bug.

## 3. Reference Files
- [Bug Report Template](file:///Users/shyam18/SEGA/qa-skills/bug-analysis/bug-report-template.md)
- [Root Cause Analysis Runbook](file:///Users/shyam18/SEGA/qa-skills/bug-analysis/root-cause-analysis.md)
- [AI Fix Instruction Guide](file:///Users/shyam18/SEGA/qa-skills/bug-analysis/ai-fix-instructions.md)

