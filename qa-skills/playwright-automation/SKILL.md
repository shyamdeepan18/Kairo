---
name: playwright-automation
description: Playwright automation guidelines, page object conventions, reliable locator patterns, and CLI execution commands for Kairo ERP.
---

# Playwright Automation Architecture & Standards

## 1. Skill Purpose
Guides test engineers and AI coding agents on writing, executing, and maintaining reliable, non-flaky Playwright tests for Kairo ERP.

## 2. Invariant Automation Rules
1. **No Arbitrary Sleep:** Never use `page.waitForTimeout(5000)`. Always rely on Playwright auto-waiting, explicit state assertions (`toBeVisible()`, `toHaveURL()`), or network-idle synchronization.
2. **Deterministic Data:** Always generate unique prefixes using `TEST-<timestamp>-<hash>` or `P2P-<random>`. Never hardcode static entity codes that cause unique constraint violations on re-runs.
3. **Tri-Layer Assertions:** A successful UI click or HTTP 200 is NOT sufficient proof of a business transaction. Always verify the database layer (`stock_ledger_entries`, `stock_balances`, `journal_entry_lines`).

## 3. Reusable References
- [Automation Standards](file:///Users/shyam18/SEGA/qa-skills/playwright-automation/automation-standards.md)
- [Reusable Components & Helpers](file:///Users/shyam18/SEGA/qa-skills/playwright-automation/reusable-components.md)
- [Selector Strategy](file:///Users/shyam18/SEGA/qa-skills/playwright-automation/selector-strategy.md)
- [Execution Guide & NPM Commands](file:///Users/shyam18/SEGA/qa-skills/playwright-automation/execution-guide.md)

