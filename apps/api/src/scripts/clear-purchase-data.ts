import { db } from '@erp/db';
import {
  purchaseRequisitions,
  purchaseRequisitionLines,
  purchaseOrders,
  purchaseOrderLines,
  goodsReceiptNotes,
  approvalRequests
} from '@erp/db';
import { inArray } from 'drizzle-orm';

async function main() {
  console.log('Checking for existing purchase data...');
  try {
    const grns = await db.select().from(goodsReceiptNotes);
    if (grns.length > 0) {
      console.error(`ERROR: Cannot delete POs and PRs because there are ${grns.length} Goods Receipt Notes (GRN) in the database.`);
      console.error('Deleting GRNs would violate accounting and stock ledger integrity constraints.');
      process.exit(1);
    }

    await db.transaction(async (tx) => {
      // Delete PO lines
      await tx.delete(purchaseOrderLines);
      console.log('Cleared purchaseOrderLines');

      // Delete POs
      await tx.delete(purchaseOrders);
      console.log('Cleared purchaseOrders');

      // Delete PR lines
      await tx.delete(purchaseRequisitionLines);
      console.log('Cleared purchaseRequisitionLines');

      // Delete PRs
      await tx.delete(purchaseRequisitions);
      console.log('Cleared purchaseRequisitions');

      // Delete approval requests (will cascade delete approval actions)
      await tx.delete(approvalRequests).where(
        inArray(approvalRequests.documentType, ['purchase.requisition', 'purchase.po'])
      );
      console.log('Cleared approvalRequests and approvalActions for PR and PO');
    });
    console.log('Successfully cleared all PO and PR data!');
  } catch (err) {
    console.error('Failed to clear data:', err);
  }
  process.exit(0);
}

main();
