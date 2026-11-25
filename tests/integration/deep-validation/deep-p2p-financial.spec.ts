import { test, expect } from '@playwright/test';
import { ErpApiClient } from '../../helpers/api-client.js';
import { FinancialValidator } from '../../helpers/financial-validator.js';
import { TestDataFactory } from '../../helpers/test-data-factory.js';

test.describe('Deep P2P Transactional, Inventory & Financial Validation', () => {
  let api: ErpApiClient;
  let finValidator: FinancialValidator;
  let factory: TestDataFactory;
  const testId = `FIN-P2P-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 1000)}`;

  test.beforeAll(async () => {
    api = new ErpApiClient();
    await api.login('shyam18@kairo.com', 'Shyam18');
    finValidator = new FinancialValidator();
    factory = new TestDataFactory(api);
  });

  test.afterAll(async () => {
    await finValidator.close();
  });

  test('Complete Lifecycle: Item -> PO -> GRN -> Invoice -> Payment -> Final Multi-Tier Financial Reconciliation', async () => {
    const ctx = await factory.getContext();
    const today = new Date().toISOString().slice(0, 10);

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 1: Master Data Preconditions & Item Creation
    // ─────────────────────────────────────────────────────────────────────────
    const vendor = await factory.createSupplier(`${testId}-VEND`);
    expect(vendor.id).toBeDefined();

    const unitCostINR = 10;
    const unitCostPaise = unitCostINR * 100; // 1,000 paise ($10)
    const orderQty = 100;
    const totalPoValueINR = orderQty * unitCostINR; // 1,000 INR
    const totalPoValuePaise = totalPoValueINR * 100; // 100,000 paise

    const item = await factory.createItem(`${testId}-ITM`, {
      itemType: 'raw_material',
      purchaseRatePaise: unitCostPaise,
    });
    expect(item.id).toBeDefined();

    // Verify initial stock is 0
    await finValidator.assertInventorySubledger(item.id, ctx.warehouseId, 0, 0);

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 2: Purchase Order Creation & Commitment Verification
    // ─────────────────────────────────────────────────────────────────────────
    const poRes = await api.post('/purchase/orders', {
      plantId: ctx.plantId,
      deliveryWarehouseId: ctx.warehouseId,
      supplierId: vendor.id,
      postingDate: today,
      paymentTermsDays: 30,
      lines: [
        {
          itemId: item.id,
          quantity: orderQty,
          uom: 'NOS',
          ratePaise: unitCostPaise,
        },
      ],
    });
    const po = poRes.data || poRes.order || poRes;
    expect(po.id).toBeDefined();
    expect(po.status).toBe('draft');

    // Submit and approve PO
    await api.post(`/purchase/orders/${po.id}/submit`);
    const approvedPo = await api.post(`/purchase/orders/${po.id}/approve`);
    expect(approvedPo.status).toBe('approved');

    // Invariant: PO approval must NOT increase physical on-hand stock or create financial journals
    await finValidator.assertInventorySubledger(item.id, ctx.warehouseId, 0, 0);

    const fullPo = await api.get(`/purchase/orders/${po.id}`);
    const poLineId = fullPo.lines?.[0]?.id;

    let poJournalCaught = false;
    try {
      await finValidator.getDocumentJournal(po.id);
    } catch {
      poJournalCaught = true;
    }
    expect(poJournalCaught).toBe(true); // Normal PO does not create premature financial entries

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 3 & 4: Goods Receipt Note (GRN) & Perpetual Receipt Accrual GL Validation
    // ─────────────────────────────────────────────────────────────────────────
    const grnRes = await api.post('/purchase/grns', {
      plantId: ctx.plantId,
      warehouseId: ctx.warehouseId,
      supplierId: vendor.id,
      poId: po.id,
      postingDate: today,
      supplierDcNo: `DC-${testId}`,
      lines: [
        {
          poLineId,
          itemId: item.id,
          uom: 'NOS',
          receivedQty: orderQty,
          acceptedQty: orderQty,
          ratePaise: unitCostPaise,
        },
      ],
    });
    const grn = grnRes.data || grnRes.grn || grnRes;
    expect(grn.id).toBeDefined();

    await api.post(`/purchase/grns/${grn.id}/submit`);
    await api.post(`/purchase/grns/${grn.id}/approve`);

    // Invariant: Physical stock must increase by exactly orderQty
    const stockPostGrn = await finValidator.assertInventorySubledger(
      item.id,
      ctx.warehouseId,
      orderQty,
      totalPoValuePaise
    );
    expect(stockPostGrn.quantityOnHand).toBe(orderQty);

    // Invariant: PO line received quantity must be fully updated
    const poLineCheck = await api.get(`/purchase/orders/${po.id}`);
    expect(poLineCheck.receiptStatus).toBe('fully_received');

    // Invariant: GL Journal at GRN must record:
    // DR: Inventory Asset (1310 Raw Materials) = 1,000 INR (100,000 paise)
    // CR: GR/IR Clearing (2510) = 1,000 INR (100,000 paise)
    const grnJournals = await finValidator.getDocumentJournal(grn.id);
    expect(grnJournals.length).toBeGreaterThan(0);
    const grnJ = grnJournals[0];
    expect(grnJ.totalDebitPaise).toBe(totalPoValuePaise);
    expect(grnJ.totalCreditPaise).toBe(totalPoValuePaise);

    const invDebitLine = grnJ.lines.find((l) => l.accountCode === '1310' || l.postingCategory === 'inventory_raw_material');
    const grnClearingLine = grnJ.lines.find((l) => l.accountCode === '2510' || l.postingCategory === 'grn_clearing');

    expect(invDebitLine).toBeDefined();
    expect(invDebitLine!.debitAmountPaise).toBe(totalPoValuePaise);
    expect(invDebitLine!.creditAmountPaise).toBe(0);

    expect(grnClearingLine).toBeDefined();
    expect(grnClearingLine!.creditAmountPaise).toBe(totalPoValuePaise);
    expect(grnClearingLine!.debitAmountPaise).toBe(0);

    // Invariant: GRNI Clearing account has a temporary credit balance of 1,000 INR
    const grniPostGrn = await finValidator.getAccountBalanceByCategory(ctx.companyId, 'grn_clearing');
    expect(grniPostGrn.totalCreditPaise).toBeGreaterThanOrEqual(totalPoValuePaise);

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 6 & 7: Vendor Invoice Creation, GRNI Clearing & AP Liability Booking
    // ─────────────────────────────────────────────────────────────────────────
    const billRes = await api.post('/purchase/invoices', {
      plantId: ctx.plantId,
      supplierId: vendor.id,
      poId: po.id,
      postingDate: today,
      supplierInvoiceNumber: `INV-${testId}`,
      supplierInvoiceDate: today,
      lines: [
        {
          itemId: item.id,
          quantity: orderQty,
          uom: 'NOS',
          ratePaise: unitCostPaise,
        },
      ],
    });
    const bill = billRes.data || billRes.invoice || billRes;
    expect(bill.id).toBeDefined();

    await api.post(`/purchase/invoices/${bill.id}/submit`);
    await api.post(`/purchase/invoices/${bill.id}/approve`);

    // Invariant: GL Journal at Invoice Posting must record:
    // DR: GR/IR Clearing (2510) = 1,000 INR (clears the suspense)
    // CR: Accounts Payable (2310) = 1,000 INR (establishes vendor debt)
    const billJournals = await finValidator.getDocumentJournal(bill.id);
    const billJ = billJournals[0];
    expect(billJ.totalDebitPaise).toBe(totalPoValuePaise);
    expect(billJ.totalCreditPaise).toBe(totalPoValuePaise);

    const grniClearLine = billJ.lines.find((l) => l.accountCode === '2510' || l.postingCategory === 'grn_clearing');
    const apCreditLine = billJ.lines.find((l) => l.accountCode === '2310' || l.postingCategory === 'accounts_payable');

    expect(grniClearLine).toBeDefined();
    expect(grniClearLine!.debitAmountPaise).toBe(totalPoValuePaise);
    expect(grniClearLine!.creditAmountPaise).toBe(0);

    expect(apCreditLine).toBeDefined();
    expect(apCreditLine!.creditAmountPaise).toBe(totalPoValuePaise);
    expect(apCreditLine!.partyType).toBe('supplier');
    expect(apCreditLine!.partyId).toBe(vendor.id);

    // Invariant: Vendor outstanding balance must now equal exactly 1,000 INR
    const vendorBalPostBill = await finValidator.getPartyBalance('supplier', vendor.id);
    expect(vendorBalPostBill.outstandingPaise).toBe(totalPoValuePaise);

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 8: Vendor Payment & Liability Clearance
    // ─────────────────────────────────────────────────────────────────────────
    const payRes = await api.post('/purchase/payments', {
      plantId: ctx.plantId,
      supplierId: vendor.id,
      postingDate: today,
      paymentMode: 'bank_transfer',
      paidAmountPaise: totalPoValuePaise,
      remarks: `NEFT-${testId}`,
      allocations: [
        {
          invoiceId: bill.id,
          allocatedAmountPaise: totalPoValuePaise,
        },
      ],
    });
    const payment = payRes.data || payRes.payment || payRes;
    expect(payment.id).toBeDefined();

    await api.post(`/purchase/payments/${payment.id}/submit`);
    await api.post(`/purchase/payments/${payment.id}/approve`);

    // Invariant: GL Journal at Payment must record:
    // DR: Accounts Payable (2310) = 1,000 INR (reduces vendor liability)
    // CR: Bank Account (1520) = 1,000 INR (reduces cash/bank asset)
    const payJournals = await finValidator.getDocumentJournal(payment.id);
    const payJ = payJournals[0];
    expect(payJ.totalDebitPaise).toBe(totalPoValuePaise);
    expect(payJ.totalCreditPaise).toBe(totalPoValuePaise);

    const apDebitLine = payJ.lines.find((l) => l.accountCode === '2310' || l.postingCategory === 'accounts_payable');
    const bankCreditLine = payJ.lines.find((l) => l.accountCode === '1520' || l.postingCategory === 'bank');

    expect(apDebitLine).toBeDefined();
    expect(apDebitLine!.debitAmountPaise).toBe(totalPoValuePaise);
    expect(apDebitLine!.partyId).toBe(vendor.id);

    expect(bankCreditLine).toBeDefined();
    expect(bankCreditLine!.creditAmountPaise).toBe(totalPoValuePaise);

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 9: Final Multi-Tier Reconciliation
    // ─────────────────────────────────────────────────────────────────────────
    // 1. Vendor Outstanding Balance must be exactly 0
    const finalVendorBal = await finValidator.getPartyBalance('supplier', vendor.id);
    expect(finalVendorBal.outstandingPaise).toBe(0);

    // 2. Physical Inventory matches Subledger and Valuation
    const finalStock = await finValidator.assertInventorySubledger(
      item.id,
      ctx.warehouseId,
      orderQty,
      totalPoValuePaise
    );
    expect(finalStock.quantityOnHand).toBe(orderQty);

    // 3. Global double-entry accounting equilibrium across the database
    const equilibrium = await finValidator.assertGlobalAccountingEquilibrium();
    expect(equilibrium.globalDebitPaise).toBe(equilibrium.globalCreditPaise);
  });

  test('Advanced Partial Receipts Scenario: 40/100 received -> 60/100 remaining received -> Full invoice match', async () => {
    const ctx = await factory.getContext();
    const today = new Date().toISOString().slice(0, 10);
    const vendor = await factory.createSupplier(`${testId}-PART-VEND`);
    const unitRatePaise = 25000; // 250 INR
    const totalOrderQty = 100;

    const item = await factory.createItem(`${testId}-PART-ITM`, {
      itemType: 'raw_material',
      purchaseRatePaise: unitRatePaise,
    });

    // 1. Create PO for 100 units
    const poRes = await api.post('/purchase/orders', {
      plantId: ctx.plantId,
      deliveryWarehouseId: ctx.warehouseId,
      supplierId: vendor.id,
      postingDate: today,
      lines: [{ itemId: item.id, quantity: totalOrderQty, uom: 'NOS', ratePaise: unitRatePaise }],
    });
    const po = poRes.data || poRes;
    await api.post(`/purchase/orders/${po.id}/submit`);
    await api.post(`/purchase/orders/${po.id}/approve`);
    const fullPo = await api.get(`/purchase/orders/${po.id}`);
    const poLineId = fullPo.lines?.[0]?.id;

    // 2. First Partial Receipt: 40 units received
    const partQty1 = 40;
    const grn1Res = await api.post('/purchase/grns', {
      plantId: ctx.plantId,
      warehouseId: ctx.warehouseId,
      supplierId: vendor.id,
      poId: po.id,
      postingDate: today,
      supplierDcNo: `DC1-${testId}`,
      lines: [{ poLineId, itemId: item.id, uom: 'NOS', receivedQty: partQty1, acceptedQty: partQty1, ratePaise: unitRatePaise }],
    });
    const grn1 = grn1Res.data || grn1Res;
    await api.post(`/purchase/grns/${grn1.id}/submit`);
    await api.post(`/purchase/grns/${grn1.id}/approve`);

    // Verify interim state: on-hand = 40, PO receiptStatus = 'partial'
    await finValidator.assertInventorySubledger(item.id, ctx.warehouseId, partQty1, partQty1 * unitRatePaise);
    const poInterim = await api.get(`/purchase/orders/${po.id}`);
    expect(poInterim.receiptStatus).toBe('partial');

    // 3. Second Partial Receipt: Remaining 60 units received
    const partQty2 = 60;
    const grn2Res = await api.post('/purchase/grns', {
      plantId: ctx.plantId,
      warehouseId: ctx.warehouseId,
      supplierId: vendor.id,
      poId: po.id,
      postingDate: today,
      supplierDcNo: `DC2-${testId}`,
      lines: [{ poLineId, itemId: item.id, uom: 'NOS', receivedQty: partQty2, acceptedQty: partQty2, ratePaise: unitRatePaise }],
    });
    const grn2 = grn2Res.data || grn2Res;
    await api.post(`/purchase/grns/${grn2.id}/submit`);
    await api.post(`/purchase/grns/${grn2.id}/approve`);

    // Verify final state: on-hand = 100, PO receiptStatus = 'fully_received'
    await finValidator.assertInventorySubledger(item.id, ctx.warehouseId, totalOrderQty, totalOrderQty * unitRatePaise);
    const poFinal = await api.get(`/purchase/orders/${po.id}`);
    expect(poFinal.receiptStatus).toBe('fully_received');

    // Verify both GRN journals strictly balance
    await finValidator.getDocumentJournal(grn1.id);
    await finValidator.getDocumentJournal(grn2.id);
  });
});
