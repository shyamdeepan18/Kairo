import { test, expect } from '@playwright/test';
import { ErpApiClient } from '../../helpers/api-client.js';
import { DbValidator } from '../../helpers/db-validator.js';
import { TestDataFactory } from '../../helpers/test-data-factory.js';

test.describe('Order-to-Cash (O2C) Complete Business Cycle', () => {
  let api: ErpApiClient;
  let dbValidator: DbValidator;
  let factory: TestDataFactory;
  const testId = `O2C-${Date.now().toString().slice(-6)}`;

  test.beforeAll(async () => {
    api = new ErpApiClient();
    await api.login('shyam18@kairo.com', 'Shyam18');
    dbValidator = new DbValidator();
    factory = new TestDataFactory(api);
  });

  test.afterAll(async () => {
    await dbValidator.close();
  });

  test('Full O2C Flow: Customer -> Inward Stock -> SO -> Reservation -> Dispatch -> Invoicing -> Receipt', async () => {
    const ctx = await factory.getContext();
    const today = new Date().toISOString().slice(0, 10);

    // 1. Create Customer Master
    const customer = await factory.createCustomer(testId);
    expect(customer.id).toBeDefined();

    // 2. Create Stock Item Master
    const item = await factory.createItem(testId, {
      itemType: 'finished_goods',
      sellingPricePaise: 150000, // 1,500 INR
      purchaseRatePaise: 90000,  // 900 INR
    });
    expect(item.id).toBeDefined();

    // 3. To maintain ERP movement-based inventory invariant, bring stock on-hand via GRN
    const initialQty = 50;
    const initialRate = 90000;
    const supplier = await factory.createSupplier(testId);
    
    // Inward GRN (direct or via PO)
    const grnRes = await api.post('/purchase/grns', {
      plantId: ctx.plantId,
      supplierId: supplier.id,
      warehouseId: ctx.warehouseId,
      postingDate: today,
      supplierDcNo: `INWARD-${testId}`,
      lines: [
        {
          itemId: item.id,
          uom: 'NOS',
          receivedQty: initialQty,
          acceptedQty: initialQty,
          ratePaise: initialRate,
        },
      ],
    });
    const grn = grnRes.data || grnRes.grn || grnRes;
    await api.post(`/purchase/grns/${grn.id}/submit`);
    await api.post(`/purchase/grns/${grn.id}/approve`);

    // Verify stock is now on-hand
    const stockAfterGrn = await dbValidator.getStockBalance(item.id, ctx.warehouseId);
    expect(Number(stockAfterGrn.quantity_on_hand)).toBeGreaterThanOrEqual(initialQty);

    // 4. Create Sales Order (SO)
    const orderQty = 15;
    const saleRate = 150000;
    const soRes = await api.post('/sales/orders', {
      plantId: ctx.plantId,
      customerId: customer.id,
      postingDate: today,
      customerPoNumber: `PO-${testId}`,
      remarks: `${testId} Sales Contract`,
      lines: [
        {
          itemId: item.id,
          quantity: orderQty,
          uom: 'NOS',
          ratePaise: saleRate,
          warehouseId: ctx.warehouseId,
        },
      ],
    });
    const so = soRes.data || soRes.order || soRes;
    expect(so.id).toBeDefined();

    // 5. Submit & Approve Sales Order
    await api.post(`/sales/orders/${so.id}/submit`);
    const approveSoRes = await api.post(`/sales/orders/${so.id}/approve`);
    expect(approveSoRes.status).toBe('approved');

    // Fetch SO detail with lines
    const soDetail = await api.get(`/sales/orders/${so.id}`);
    const soLine = soDetail.lines ? soDetail.lines[0] : null;
    expect(soLine).toBeDefined();

    // ── INVENTORY RESERVATION VERIFICATION ───────────────────────────────────
    const [reservation] = await dbValidator.sql`
      SELECT id, reserved_qty FROM stock_reservations
      WHERE document_id = ${so.id} AND item_id = ${item.id}
    `;
    expect(reservation).toBeDefined();
    expect(Number(reservation.reserved_qty)).toBe(orderQty);

    // 6. Create Delivery Challan (Dispatch)
    const dcRes = await api.post('/sales/deliveries', {
      plantId: ctx.plantId,
      customerId: customer.id,
      soId: so.id,
      warehouseId: ctx.warehouseId,
      postingDate: today,
      remarks: `${testId} Order Dispatch`,
      lines: [
        {
          itemId: item.id,
          soLineId: soLine ? soLine.id : undefined,
          deliveredQty: orderQty,
          uom: 'NOS',
          ratePaise: saleRate,
          warehouseId: ctx.warehouseId,
        },
      ],
    });
    const dc = dcRes.data || dcRes.delivery || dcRes;
    expect(dc.id).toBeDefined();

    // 7. Submit & Approve Delivery Challan
    await api.post(`/sales/deliveries/${dc.id}/submit`);
    const approveDcRes = await api.post(`/sales/deliveries/${dc.id}/approve`);
    expect(approveDcRes.ok).toBe(true);

    // ── DATABASE INVARIANT CHECKS POST-DISPATCH ──────────────────────────────
    // A. Verify Outward Stock Ledger Entry
    const dcSles = await dbValidator.verifyStockLedgerEntry(dc.id, 'sales_delivery');
    expect(dcSles.length).toBeGreaterThan(0);
    expect(Number(dcSles[0].quantity)).toBe(orderQty);

    // B. Verify Reservation is Released
    await dbValidator.verifyReservationsCleared(so.id);

    // C. Verify COGS / Inventory GL Voucher
    await dbValidator.verifyJournalForDocument(dc.id);

    // 8. Create Sales Invoice (Tax Invoice)
    const dcDetail = await api.get(`/sales/deliveries/${dc.id}`);
    const dcLine = dcDetail.lines ? dcDetail.lines[0] : null;
    const invRes = await api.post('/sales/invoices', {
      plantId: ctx.plantId,
      customerId: customer.id,
      soId: so.id,
      deliveryId: dc.id,
      postingDate: today,
      lines: [
        {
          itemId: item.id,
          soLineId: soLine ? soLine.id : undefined,
          deliveryLineId: dcLine ? dcLine.id : undefined,
          quantity: orderQty,
          uom: 'NOS',
          ratePaise: saleRate,
        },
      ],
    });
    const inv = invRes.data || invRes.invoice || invRes;
    expect(inv.id).toBeDefined();

    // 9. Submit & Approve Sales Invoice
    await api.post(`/sales/invoices/${inv.id}/submit`);
    const approveInvRes = await api.post(`/sales/invoices/${inv.id}/approve`);
    expect(approveInvRes.ok).toBe(true);

    // Verify Sales Invoice Balanced Double-Entry (DR Customer AR / CR Revenue)
    await dbValidator.verifyJournalForDocument(inv.id);

    // 10. Process Customer Receipt Voucher
    const invoiceTotalPaise = (orderQty * saleRate);
    const receiptRes = await api.post('/sales/receipts', {
      plantId: ctx.plantId,
      customerId: customer.id,
      postingDate: today,
      receiptMode: 'bank_transfer',
      receivedAmountPaise: invoiceTotalPaise,
      remarks: `${testId} Customer Inward Remittance`,
      allocations: [
        {
          invoiceId: inv.id,
          allocatedAmountPaise: invoiceTotalPaise,
        },
      ],
    });
    const receipt = receiptRes.data || receiptRes.receipt || receiptRes;
    expect(receipt.id).toBeDefined();

    // 11. Submit & Approve Customer Receipt
    await api.post(`/sales/receipts/${receipt.id}/submit`);
    const approveReceiptRes = await api.post(`/sales/receipts/${receipt.id}/approve`);
    expect(approveReceiptRes.ok).toBe(true);

    // Verify Receipt Balanced Double-Entry (DR Bank / CR Customer AR)
    await dbValidator.verifyJournalForDocument(receipt.id);
  });
});
