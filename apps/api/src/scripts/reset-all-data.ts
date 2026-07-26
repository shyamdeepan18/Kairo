import { db } from '@erp/db';
import { sql } from 'drizzle-orm';

async function resetAllDataExceptAdmin() {
  console.log('🧹 Starting database reset (preserving system admin login)...');

  try {
    await db.execute(sql`
      -- Truncate all transactional and operational tables
      TRUNCATE TABLE 
        inventory_movements,
        stock_ledger,
        journal_entry_lines,
        journal_entries,
        sales_invoice_lines,
        sales_invoices,
        delivery_note_lines,
        delivery_notes,
        sales_order_lines,
        sales_orders,
        sales_quotation_lines,
        sales_quotations,
        ap_invoice_lines,
        ap_invoices,
        grn_lines,
        goods_receipt_notes,
        purchase_order_lines,
        purchase_orders,
        purchase_requisition_lines,
        purchase_requisitions,
        customer_receipts,
        supplier_payments,
        approval_actions,
        approval_requests
      CASCADE;
    `);

    console.log('✅ All transactions, orders, invoices, stock ledgers, and approval requests cleared successfully.');
    console.log('🔒 Admin accounts, system roles, and baseline configurations preserved.');
  } catch (error) {
    console.error('❌ Error resetting database:', error);
  }
  process.exit(0);
}

resetAllDataExceptAdmin();
