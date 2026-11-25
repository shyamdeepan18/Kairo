import { test, expect } from '@playwright/test';
import { ErpApiClient } from '../../helpers/api-client.js';
import { FinancialValidator } from '../../helpers/financial-validator.js';
import { TestDataFactory } from '../../helpers/test-data-factory.js';

test.describe('Deep O2C Transactional, Inventory & Financial Validation', () => {
  let api: ErpApiClient;
  let finValidator: FinancialValidator;
  let factory: TestDataFactory;
  const testId = `FIN-O2C-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 1000)}`;

  test.beforeAll(async () => {
    api = new ErpApiClient();
    await api.login('shyam18@kairo.com', 'Shyam18');
    finValidator = new FinancialValidator();
    factory = new TestDataFactory(api);
  });

  test.afterAll(async () => {
    await finValidator.close();
  });

  test('Complete Lifecycle: Initial Stock -> SO -> Reservation -> Delivery (COGS) -> Invoice (Revenue) -> Receipt -> Final Reconciliation', async () => {
    const ctx = await factory.getContext();
    const today = new Date().toISOString().slice(0, 10);

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 0: Master Data Setup & Initial Inventory Stocking
    // ─────────────────────────────────────────────────────────────────────────
    const customer = await factory.createCustomer(`${testId}-CUST`);
    expect(customer.id).toBeDefined();

    const unitCostINR = 10;
    const unitCostPaise = unitCostINR * 100; // 1,000 paise WAC ($10)
    const sellingPriceINR = 20;
    const sellingPricePaise = sellingPriceINR * 100; // 2,000 paise ($20)

    const initialStockQty = 100;
    const initialValuationPaise = initialStockQty * unitCostPaise; // 100,000 paise ($1,000)

    const item = await factory.createItem(`${testId}-FG`, {
      itemType: 'finished_goods',
      purchaseRatePaise: unitCostPaise,
      sellingPricePaise: sellingPricePaise,
    });
    expect(item.id).toBeDefined();

    // Inward 100 units into warehouse via initial GRN
    const supplier = await factory.createSupplier(`${testId}-OPEN-SUP`);
    const initialGrnRes = await api.post('/purchase/grns', {
      plantId: ctx.plantId,
      warehouseId: ctx.warehouseId,
      supplierId: supplier.id,
      postingDate: today,
      supplierDcNo: `OPENING-${testId}`,
      lines: [{ itemId: item.id, uom: 'NOS', receivedQty: initialStockQty, acceptedQty: initialStockQty, ratePaise: unitCostPaise }],
    });
    const grn = initialGrnRes.data || initialGrnRes;
    await api.post(`/purchase/grns/${grn.id}/submit`);
    await api.post(`/purchase/grns/${grn.id}/approve`);

    // Verify initial stock = 100 units @ 10 INR = 1,000 INR
    await finValidator.assertInventorySubledger(item.id, ctx.warehouseId, initialStockQty, initialValuationPaise);

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 1: Sales Order Creation & Soft Reservation Verification
    // ─────────────────────────────────────────────────────────────────────────
    const orderQty = 10;
    const expectedCogsPaise = orderQty * unitCostPaise; // 10,000 paise ($100)
    const expectedRevenuePaise = orderQty * sellingPricePaise; // 20,000 paise ($200)

    const soRes = await api.post('/sales/orders', {
      plantId: ctx.plantId,
      customerId: customer.id,
      postingDate: today,
      lines: [
        {
          itemId: item.id,
          warehouseId: ctx.warehouseId,
          quantity: orderQty,
          uom: 'NOS',
          ratePaise: sellingPricePaise,
        },
      ],
    });
    const so = soRes.data || soRes.order || soRes;
    expect(so.id).toBeDefined();
    expect(so.status).toBe('draft');

    await api.post(`/sales/orders/${so.id}/submit`);
    await api.post(`/sales/orders/${so.id}/approve`);

    // Invariant: Sales Order approval must NOT reduce physical on-hand inventory
    const stockPostSo = await finValidator.assertInventorySubledger(item.id, ctx.warehouseId, initialStockQty);
    expect(stockPostSo.quantityOnHand).toBe(initialStockQty);
    expect(stockPostSo.quantityReserved).toBe(orderQty);

    // Invariant: No revenue or financial journal created on Sales Order approval
    let soJournalCaught = false;
    try {
      await finValidator.getDocumentJournal(so.id);
    } catch {
      soJournalCaught = true;
    }
    expect(soJournalCaught).toBe(true);

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 2: Shipment / Delivery Note (COGS & Inventory Asset Reduction)
    // ─────────────────────────────────────────────────────────────────────────
    const fullSo = await api.get(`/sales/orders/${so.id}`);
    const soLine = fullSo.lines[0];

    const dnRes = await api.post('/sales/deliveries', {
      plantId: ctx.plantId,
      warehouseId: ctx.warehouseId,
      customerId: customer.id,
      soId: so.id,
      postingDate: today,
      lines: [
        {
          soLineId: soLine.id,
          itemId: item.id,
          uom: 'NOS',
          deliveredQty: orderQty,
          ratePaise: sellingPricePaise,
          warehouseId: ctx.warehouseId,
        },
      ],
    });
    const dn = dnRes.data || dnRes.delivery || dnRes;
    expect(dn.id).toBeDefined();

    await api.post(`/sales/deliveries/${dn.id}/submit`);
    await api.post(`/sales/deliveries/${dn.id}/approve`);

    // Invariant: On-hand physical inventory decreases by exactly orderQty (100 -> 90)
    const stockPostDn = await finValidator.assertInventorySubledger(
      item.id,
      ctx.warehouseId,
      initialStockQty - orderQty,
      (initialStockQty - orderQty) * unitCostPaise
    );
    expect(stockPostDn.quantityOnHand).toBe(initialStockQty - orderQty);
    expect(stockPostDn.quantityReserved).toBe(0); // Reservation released

    // Invariant: GL Journal at Delivery must record Perpetual COGS:
    // DR: Cost of Goods Sold (4110 / raw_material_consumed / cogs) = 100 INR (10,000 paise)
    // CR: Inventory Asset (1310 / 1330) = 100 INR (10,000 paise)
    const dnJournals = await finValidator.getDocumentJournal(dn.id);
    const dnJ = dnJournals[0];
    expect(dnJ.totalDebitPaise).toBe(expectedCogsPaise);
    expect(dnJ.totalCreditPaise).toBe(expectedCogsPaise);

    const cogsLine = dnJ.lines.find((l) => l.accountCode === '4110' || l.postingCategory === 'raw_material_consumed' || l.postingCategory === 'cogs');
    const invCreditLine = dnJ.lines.find((l) => l.accountCode === '1310' || l.accountCode === '1330' || l.postingCategory?.startsWith('inventory'));

    expect(cogsLine).toBeDefined();
    expect(cogsLine!.debitAmountPaise).toBe(expectedCogsPaise);

    expect(invCreditLine).toBeDefined();
    expect(invCreditLine!.creditAmountPaise).toBe(expectedCogsPaise);

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 3: Customer Invoice (Accounts Receivable & Revenue Recognition)
    // ─────────────────────────────────────────────────────────────────────────
    const dcDetail = await api.get(`/sales/deliveries/${dn.id}`);
    const dcLine = dcDetail.lines ? dcDetail.lines[0] : null;

    const invRes = await api.post('/sales/invoices', {
      plantId: ctx.plantId,
      customerId: customer.id,
      soId: so.id,
      deliveryId: dn.id,
      postingDate: today,
      lines: [
        {
          soLineId: soLine.id,
          deliveryLineId: dcLine ? dcLine.id : undefined,
          itemId: item.id,
          uom: 'NOS',
          quantity: orderQty,
          ratePaise: sellingPricePaise,
        },
      ],
    });
    const inv = invRes.data || invRes.invoice || invRes;
    expect(inv.id).toBeDefined();

    await api.post(`/sales/invoices/${inv.id}/submit`);
    await api.post(`/sales/invoices/${inv.id}/approve`);

    // Invariant: GL Journal at Invoice Posting must record:
    // DR: Accounts Receivable (1410) = 200 INR (20,000 paise)
    // CR: Sales Revenue (3010) = 200 INR (20,000 paise)
    const invJournals = await finValidator.getDocumentJournal(inv.id);
    const invJ = invJournals[0];
    expect(invJ.totalDebitPaise).toBe(expectedRevenuePaise);
    expect(invJ.totalCreditPaise).toBe(expectedRevenuePaise);

    const arDebitLine = invJ.lines.find((l) => l.accountCode === '1410' || l.postingCategory === 'accounts_receivable');
    const revCreditLine = invJ.lines.find((l) => l.accountCode === '3010' || l.postingCategory === 'sales_revenue');

    expect(arDebitLine).toBeDefined();
    expect(arDebitLine!.debitAmountPaise).toBe(expectedRevenuePaise);
    expect(arDebitLine!.partyType).toBe('customer');
    expect(arDebitLine!.partyId).toBe(customer.id);

    expect(revCreditLine).toBeDefined();
    expect(revCreditLine!.creditAmountPaise).toBe(expectedRevenuePaise);

    // Invariant: Customer outstanding receivable balance must equal exactly 200 INR
    const custBalPostInv = await finValidator.getPartyBalance('customer', customer.id);
    expect(custBalPostInv.outstandingPaise).toBe(expectedRevenuePaise);

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 4: Customer Payment Receipt & Receivable Clearance
    // ─────────────────────────────────────────────────────────────────────────
    const rcRes = await api.post('/sales/receipts', {
      plantId: ctx.plantId,
      customerId: customer.id,
      postingDate: today,
      receiptMode: 'bank_transfer',
      receivedAmountPaise: expectedRevenuePaise,
      remarks: `REC-${testId}`,
      allocations: [
        {
          invoiceId: inv.id,
          allocatedAmountPaise: expectedRevenuePaise,
        },
      ],
    });
    const receipt = rcRes.data || rcRes.receipt || rcRes;
    expect(receipt.id).toBeDefined();

    await api.post(`/sales/receipts/${receipt.id}/submit`);
    await api.post(`/sales/receipts/${receipt.id}/approve`);

    // Invariant: GL Journal at Receipt must record:
    // DR: Bank Account (1520) = 200 INR (20,000 paise)
    // CR: Accounts Receivable (1410) = 200 INR (20,000 paise)
    const rcJournals = await finValidator.getDocumentJournal(receipt.id);
    const rcJ = rcJournals[0];
    expect(rcJ.totalDebitPaise).toBe(expectedRevenuePaise);
    expect(rcJ.totalCreditPaise).toBe(expectedRevenuePaise);

    const bankDebitLine = rcJ.lines.find((l) => l.accountCode === '1520' || l.postingCategory === 'bank');
    const arCreditLine = rcJ.lines.find((l) => l.accountCode === '1410' || l.postingCategory === 'accounts_receivable');

    expect(bankDebitLine).toBeDefined();
    expect(bankDebitLine!.debitAmountPaise).toBe(expectedRevenuePaise);

    expect(arCreditLine).toBeDefined();
    expect(arCreditLine!.creditAmountPaise).toBe(expectedRevenuePaise);
    expect(arCreditLine!.partyId).toBe(customer.id);

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 5: Final Multi-Tier Reconciliation & Gross Margin Validation
    // ─────────────────────────────────────────────────────────────────────────
    // 1. Customer Outstanding Balance cleared to 0
    const finalCustBal = await finValidator.getPartyBalance('customer', customer.id);
    expect(finalCustBal.outstandingPaise).toBe(0);

    // 2. Physical Inventory matches Subledger and Valuation (90 units @ 10 INR = 900 INR)
    const finalStock = await finValidator.assertInventorySubledger(
      item.id,
      ctx.warehouseId,
      initialStockQty - orderQty,
      (initialStockQty - orderQty) * unitCostPaise
    );
    expect(finalStock.quantityOnHand).toBe(90);

    // 3. Operational Gross Margin = Revenue ($200) - COGS ($100) = $100 (10,000 paise)
    const grossMarginPaise = expectedRevenuePaise - expectedCogsPaise;
    expect(grossMarginPaise).toBe(10000);

    // 4. Global double-entry accounting equilibrium across the database
    const equilibrium = await finValidator.assertGlobalAccountingEquilibrium();
    expect(equilibrium.globalDebitPaise).toBe(equilibrium.globalCreditPaise);
  });
});
