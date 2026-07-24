# Kairo ERP Agent Rules

## Multi-Tenant Data Security (Company ID Filtering)
The Kairo ERP is a Multi-Tenant SaaS application running on a single database. 
- **CRITICAL RULE:** Every database `select`, `update`, or `delete` query must strictly filter by `company_id` whenever the table has a `company_id` column. 
- You must never write a query that could accidentally expose, leak, or modify data belonging to another company.

## Customer Customization Strategy
Kairo is a monolithic application where all customers share the same API instance. 
- **CRITICAL RULE:** Never fork the codebase or create separate API routes for a specific customer.
- **Custom Fields:** If a customer requests custom data fields on a document (e.g., Sales Order), use the Document Engine's **L2 Custom Fields** (which stores data as JSONB) rather than altering the core database schema.
- **Custom Features:** If a customer requests a completely custom feature or business rule, build it into the main codebase but hide it behind a **Feature Flag** or a **Company Plugin** that is only turned `on` for their specific `company_id`.
