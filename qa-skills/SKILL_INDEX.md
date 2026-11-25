# Kairo ERP — Task-to-Skill Selector Index (Token Optimization)

Use this lookup matrix to select the minimal set of skills to load for any given engineering or QA task.

| Task Category | User / Agent Objective | Skills to Load | Estimated Token Cost |
|---|---|---|---|
| **P2P Testing / Bugfix** | Test or debug Requisitions, PO, GRN, LCV, Invoices, Payments | `erp-application-knowledge`<br>`erp-business-workflows/p2p-workflow.md`<br>`erp-module-testing/purchasing-tests.md`<br>`playwright-automation` | ~2,500 tokens |
| **O2C Testing / Bugfix** | Test or debug Quotations, SO, FEFO, Deliveries, Quick Invoice, AR | `erp-application-knowledge`<br>`erp-business-workflows/o2c-workflow.md`<br>`erp-module-testing/sales-tests.md`<br>`playwright-automation` | ~2,500 tokens |
| **Subcontracting (GAP 4)** | Test or debug Outside Job Work Orders, Challans, Receipts, Capitalization | `erp-application-knowledge`<br>`erp-business-workflows/subcontracting-workflow.md`<br>`bug-analysis` | ~2,200 tokens |
| **Accounting & General Ledger** | Validate COA, balanced JVs, Bank Reconciliation (GAP 10), Project Accounting (GAP 8) | `erp-application-knowledge`<br>`erp-module-testing/finance-tests.md`<br>`regression-testing` | ~2,300 tokens |
| **Defect Triage & Investigation** | Investigate a test failure, establish root cause, author bug report | `bug-analysis`<br>`erp-business-workflows`<br>`playwright-automation` | ~2,800 tokens |
| **Full Regression Execution** | Execute end-to-end regression across all modules and verify reports | `regression-testing`<br>`playwright-automation` | ~1,800 tokens |
| **Deep Financial & Inventory Validation** | Validate multi-tier double entry ($\sum \text{Dr} = \sum \text{Cr}$), GRNI clearing, COGS, WAC, AP/AR subledgers | `erp-financial-validation`<br>`erp-accounting-and-gl`<br>`erp-inventory-and-valuation` | ~2,100 tokens |
| **Master Data Maintenance** | Add or modify Items, UOM, Suppliers, Customers, Warehouses | `erp-application-knowledge`<br>`erp-module-testing` | ~1,900 tokens |
| **UI Automation Enhancement** | Build new Page Object Models, custom locators, or interactive tests | `playwright-automation`<br>`erp-application-knowledge/module-inventory.md` | ~2,400 tokens |

---

## Loading Decision Protocol

```mermaid
flowchart TD
    UserQuery["Incoming User Query"] --> Identify["Identify Domain & Operation"]
    Identify --> LookUp{"Is it P2P, O2C, Subcon, Finance, or Shell?"}
    LookUp -->|P2P| LoadP2P["Load erp-business-workflows/p2p-workflow.md + purchasing-tests.md"]
    LookUp -->|O2C| LoadO2C["Load erp-business-workflows/o2c-workflow.md + sales-tests.md"]
    LookUp -->|Subcon| LoadSubcon["Load erp-business-workflows/subcontracting-workflow.md"]
    LookUp -->|GL / Finance| LoadGL["Load erp-module-testing/finance-tests.md"]
    LookUp -->|Failure Triage| LoadBug["Load bug-analysis/SKILL.md + bug-report-template.md"]
    LoadP2P --> Execute["Execute Specific Test / Verification CLI"]
    LoadO2C --> Execute
    LoadSubcon --> Execute
    LoadGL --> Execute
    LoadBug --> Execute
```

