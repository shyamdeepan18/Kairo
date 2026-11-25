import { test, expect } from '@playwright/test';
import { ErpApiClient } from '../../helpers/api-client.js';
import { DbValidator } from '../../helpers/db-validator.js';
import { TestDataFactory } from '../../helpers/test-data-factory.js';

test.describe('Procure-to-Pay (P2P) Complete Business Cycle', () => {
  let api: ErpApiClient;
  let dbValidator: DbValidator;
  let factory: TestDataFactory;
  const testId = `P2P-${Date.now().toString().slice(-6)}`;

  test.beforeAll(async () => {
    api = new ErpApiClient();
    await api.login('shyam18@kairo.com', 'Shyam18');
    dbValidator = new DbValidator();
    factory = new TestDataFactory(api);
  });

  test.afterAll(async () => {
    await dbValidator.close();
  });

  test('Full P2P Flow: Supplier -> Item -> PO -> GRN -> Invoicing -> Payment & Verification', async () => {
    const ctx = await factory.getContext();
    const today = new Date().toISOString().slice(0, 10);

    // 1. Create Supplier Master
    const supplier = await factory.createSupplier(testId);
    expect(supplier.id).toBeDefined();

    // 2. Create Stock Item Master
    const item = await factory.createItem(testId, {
      itemType: 'raw_material',
      purchaseRatePaise: 100000, // 1,000 INR
    });
    expect(item.id).toBeDefined();

    // 3. Create Purchase Order (PO)
    const poQty = 20;
    const poRate = 100000;
    const poRes = await api.post('/purchase/orders', {
      plantId: ctx.plantId,
      supplierId: supplier.id,
      postingDate: today,
      remarks: `${testId} Standard PO`,
      lines: [
        {
          itemId: item.id,
          quantity: poQty,
          uom: 'NOS',
          ratePaise: poRate,
          warehouseId: ctx.warehouseId,
        },
      ],
    });
    const po = poRes.data || poRes.order || poRes;
    expect(po.id).toBeDefined();
    expect(po.status).toBe('draft');

    // 4. Submit then Approve Purchase Order
    await api.post(`/purchase/orders/${po.id}/submit`);
    const poApproveRes = await api.post(`/purchase/orders/${po.id}/approve`);
    const approvedPo = poApproveRes.data || poApproveRes.order || poApproveRes;
    expect(approvedPo.status).toBe('approved');

    // 5. Create Goods Receipt Note (GRN) for partial/full receipt (e.g. 20 units)
    const poLine = approvedPo.lines ? approvedPo.lines[0] : null;
    const grnRes = await api.post('/purchase/grns', {
      plantId: ctx.plantId,
      supplierId: supplier.id,
      poId: po.id,
      warehouseId: ctx.warehouseId,
      postingDate: today,
      supplierDcNo: `DC-${testId}`,
      remarks: `${testId} Inward Receipt`,
      lines: [
        {
          itemId: item.id,
          poLineId: poLine ? poLine.id : undefined,
          uom: 'NOS',
          receivedQty: poQty,
          acceptedQty: poQty,
          rejectedQty: 0,
          ratePaise: poRate,
        },
      ],
    });
    const grn = grnRes.data || grnRes.grn || grnRes;
    expect(grn.id).toBeDefined();

    // 6. Submit then Approve GRN
    await api.post(`/purchase/grns/${grn.id}/submit`);
    const approveGrnRes = await api.post(`/purchase/grns/${grn.id}/approve`);
    const approvedGrn = approveGrnRes.data || approveGrnRes.grn || approveGrnRes;
    expect(approvedGrn.status).toBe('approved');

    // ── DATABASE LAYER VERIFICATION ──────────────────────────────────────────
    // A. Verify Stock Ledger Entry (movement_type: purchase_receipt)
    const sles = await dbValidator.verifyStockLedgerEntry(grn.id, 'purchase_receipt');
    expect(sles.length).toBeGreaterThan(0);
    const primarySle = sles[0];
    expect(Number(primarySle.quantity)).toBe(poQty);
    expect(Number(primarySle.valuation_rate_paise)).toBe(poRate);

    // B. Verify Materialized Stock Balance
    const balance = await dbValidator.getStockBalance(item.id, ctx.warehouseId);
    expect(balance).not.toBeNull();
    expect(Number(balance.quantity_on_hand)).toBeGreaterThanOrEqual(poQty);

    // C. Verify GRN Double-Entry Balance (DR Inventory Asset / CR AP Clearing)
    const grnJournals = await dbValidator.verifyJournalForDocument(grn.id);
    expect(grnJournals.length).toBeGreaterThan(0);

    // 7. Create Purchase Invoice (Bill)
    const grnLine = approvedGrn.lines ? approvedGrn.lines[0] : null;
    const billRes = await api.post('/purchase/invoices', {
      plantId: ctx.plantId,
      supplierId: supplier.id,
      poId: po.id,
      postingDate: today,
      supplierInvoiceNumber: `INV-${testId}`,
      supplierInvoiceDate: today,
      lines: [
        {
          itemId: item.id,
          poLineId: poLine ? poLine.id : undefined,
          grnLineId: grnLine ? grnLine.id : undefined,
          quantity: poQty,
          uom: 'NOS',
          ratePaise: poRate,
        },
      ],
    });
    const bill = billRes.data || billRes.invoice || billRes;
    expect(bill.id).toBeDefined();

    // 8. Submit then Approve Purchase Invoice
    await api.post(`/purchase/invoices/${bill.id}/submit`);
    const approveBillRes = await api.post(`/purchase/invoices/${bill.id}/approve`);
    const approvedBill = approveBillRes.data || approveBillRes.invoice || approveBillRes;
    expect(approvedBill.status).toBe('approved');

    // Verify Invoice Double-Entry Balance (DR AP Clearing / CR Vendor AP)
    await dbValidator.verifyJournalForDocument(bill.id);

    // 9. Process Vendor Payment
    const billTotalPaise = approvedBill.totalAmountPaise || (poQty * poRate);
    const payRes = await api.post('/purchase/payments', {
      plantId: ctx.plantId,
      supplierId: supplier.id,
      postingDate: today,
      paymentMode: 'bank_transfer',
      paidAmountPaise: billTotalPaise,
      remarks: `${testId} Vendor Settlement`,
      allocations: [
        {
          invoiceId: bill.id,
          allocatedAmountPaise: billTotalPaise,
        },
      ],
    });
    const payment = payRes.data || payRes.payment || payRes;
    expect(payment.id).toBeDefined();

    // 10. Submit then Approve Payment
    await api.post(`/purchase/payments/${payment.id}/submit`);
    const approvePayRes = await api.post(`/purchase/payments/${payment.id}/approve`);
    const approvedPay = approvePayRes.data || approvePayRes.payment || approvePayRes;
    expect(approvedPay.status).toBe('approved');

    // Verify Payment Double-Entry Balance (DR Vendor AP / CR Bank)
    await dbValidator.verifyJournalForDocument(payment.id);
  });
});
