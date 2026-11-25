import { test, expect } from '@playwright/test';
import { ErpApiClient } from '../../helpers/api-client.js';
import { TestDataFactory } from '../../helpers/test-data-factory.js';
import { FinancialValidator } from '../../helpers/financial-validator.js';

test.describe('Extended ERP Modules & Workflow Validation', () => {
  let api: ErpApiClient;
  let factory: TestDataFactory;
  let finValidator: FinancialValidator;
  const testId = `EXT-${Date.now().toString().slice(-6)}`;

  test.beforeAll(async () => {
    api = new ErpApiClient();
    await api.login('shyam18@kairo.com', 'Shyam18');
    factory = new TestDataFactory(api);
    finValidator = new FinancialValidator();
  });

  test.afterAll(async () => {
    await finValidator.close();
  });

  test('1. Blanket Purchase Order lifecycle (Draft -> Submit -> Approve)', async () => {
    const ctx = await factory.getContext();
    const vendor = await factory.createSupplier(`${testId}-BPO-SUP`);
    const item = await factory.createItem(`${testId}-BPO-ITEM`, { purchaseRatePaise: 5000 });
    const today = new Date().toISOString().slice(0, 10);
    const validTo = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

    const bpoRes = await api.post('/purchase/blanket-orders', {
      plantId: ctx.plantId,
      supplierId: vendor.id,
      postingDate: today,
      validFrom: today,
      validTo,
      lines: [
        {
          itemId: item.id,
          committedQty: 100,
          uom: 'NOS',
          ratePaise: 5000,
        },
      ],
    });
    const bpo = bpoRes.data || bpoRes;
    expect(bpo.id).toBeDefined();

    await api.post(`/purchase/blanket-orders/${bpo.id}/submit`);
    const approvedBpo = await api.post(`/purchase/blanket-orders/${bpo.id}/approve`);
    expect(approvedBpo.status).toBe('approved');
  });

  test('2. Stock Adjustment lifecycle (Draft -> Submit -> Approve -> SLE & GL)', async () => {
    const ctx = await factory.getContext();
    const item = await factory.createItem(`${testId}-ADJ-ITEM`, { purchaseRatePaise: 2000 });
    const today = new Date().toISOString().slice(0, 10);

    const adjRes = await api.post('/inventory/adjustments', {
      plantId: ctx.plantId,
      warehouseId: ctx.warehouseId,
      postingDate: today,
      adjustmentType: 'physical_count',
      reason: 'Physical cycle count variance',
      lines: [
        {
          itemId: item.id,
          uom: 'NOS',
          quantity: 25,
          valuationRatePaise: 2000,
          movementType: 'adjustment_in',
        },
      ],
    });
    const adj = adjRes.data || adjRes;
    expect(adj.id).toBeDefined();

    await api.post(`/inventory/adjustments/${adj.id}/submit`);
    const approvedAdj = await api.post(`/inventory/adjustments/${adj.id}/approve`);
    expect(approvedAdj.ok || approvedAdj.status === 'approved').toBeTruthy();

    // Verify Stock Ledger Entry
    const stock = await finValidator.assertInventorySubledger(item.id, ctx.warehouseId, 25, 25 * 2000);
    expect(stock.quantityOnHand).toBe(25);
  });

  test('3. Stock Transfer lifecycle (Dispatch -> Receive -> Inter-warehouse balance)', async () => {
    const ctx = await factory.getContext();
    const item = await factory.createItem(`${testId}-XFER-ITEM`, { purchaseRatePaise: 1500 });
    const today = new Date().toISOString().slice(0, 10);

    // Initial stock in source warehouse
    const vendor = await factory.createSupplier(`${testId}-XFER-SUP`);
    const grnRes = await api.post('/purchase/grns', {
      plantId: ctx.plantId,
      warehouseId: ctx.warehouseId,
      supplierId: vendor.id,
      postingDate: today,
      supplierDcNo: `DC-XFER-${testId}`,
      lines: [{ itemId: item.id, uom: 'NOS', receivedQty: 50, acceptedQty: 50, ratePaise: 1500 }],
    });
    const grn = grnRes.data || grnRes;
    await api.post(`/purchase/grns/${grn.id}/submit`);
    await api.post(`/purchase/grns/${grn.id}/approve`);

    // Create a target warehouse in Settings
    const targetWhRes = await api.post(`/settings/${ctx.companyId}/warehouses`, {
      plantId: ctx.plantId,
      code: `WH-T-${Date.now().toString().slice(-4)}`,
      name: `Target WH ${testId}`,
      warehouseType: 'finished_goods',
    });
    const targetWh = targetWhRes.warehouse || targetWhRes.data || targetWhRes;
    expect(targetWh.id).toBeDefined();

    // Create Transfer (Direct)
    const xferRes = await api.post('/inventory/transfers', {
      plantId: ctx.plantId,
      fromWarehouseId: ctx.warehouseId,
      toWarehouseId: targetWh.id,
      postingDate: today,
      transferType: 'direct',
      lines: [
        {
          itemId: item.id,
          uom: 'NOS',
          quantity: 20,
        },
      ],
    });
    const xfer = xferRes.data || xferRes;
    expect(xfer.id).toBeDefined();

    await api.post(`/inventory/transfers/${xfer.id}/submit`);
    const approvedXfer = await api.post(`/inventory/transfers/${xfer.id}/approve`);
    expect(approvedXfer.ok || approvedXfer.status === 'approved').toBeTruthy();

    // Verify source warehouse on-hand = 30, target warehouse on-hand = 20
    const sourceStock = await finValidator.assertInventorySubledger(item.id, ctx.warehouseId, 30);
    expect(sourceStock.quantityOnHand).toBe(30);

    const targetStock = await finValidator.assertInventorySubledger(item.id, targetWh.id, 20);
    expect(targetStock.quantityOnHand).toBe(20);
  });

  test('4. Landed Cost Voucher (LCV) lifecycle & Valuation Roll-Up', async () => {
    const ctx = await factory.getContext();
    const item = await factory.createItem(`${testId}-LCV-ITEM`, { purchaseRatePaise: 1000 });
    const vendor = await factory.createSupplier(`${testId}-LCV-SUP`);
    const today = new Date().toISOString().slice(0, 10);

    // 1. Initial Receipt: 10 units @ 10.00 INR = 100.00 INR (10,000 paise)
    const grnRes = await api.post('/purchase/grns', {
      plantId: ctx.plantId,
      warehouseId: ctx.warehouseId,
      supplierId: vendor.id,
      postingDate: today,
      supplierDcNo: `DC-LCV-${testId}`,
      lines: [{ itemId: item.id, uom: 'NOS', receivedQty: 10, acceptedQty: 10, ratePaise: 1000 }],
    });
    const grn = grnRes.data || grnRes;
    await api.post(`/purchase/grns/${grn.id}/submit`);
    await api.post(`/purchase/grns/${grn.id}/approve`);

    // Verify base subledger: 10 units @ 1000 paise = 10,000 paise
    await finValidator.assertInventorySubledger(item.id, ctx.warehouseId, 10, 10000);

    // 2. Fetch freight / expense account
    const accounts = await api.get('/settings/coa');
    const expAcc = (accounts.accounts || accounts).find((a: any) => a.accountType === 'expense' && !a.isGroup);
    expect(expAcc).toBeDefined();

    // 3. Create Landed Cost Voucher: allocate ₹20 (2,000 paise) freight expense
    const lcvRes = await api.post('/purchase/landed-cost-vouchers', {
      plantId: ctx.plantId,
      postingDate: today,
      allocationBasis: 'by_qty',
      applicableGrnIds: [grn.id],
      expenseLines: [
        {
          expenseAccountId: expAcc.id,
          amountPaise: 2000,
          description: 'Freight Charges LCV',
        },
      ],
    });
    const lcv = lcvRes.data || lcvRes;
    expect(lcv.id).toBeDefined();

    // 4. Post LCV
    const postRes = await api.post(`/purchase/landed-cost-vouchers/${lcv.id}/post`);
    expect(postRes.ok).toBe(true);

    // 5. Verify LCV Journal Voucher was posted and strictly balanced
    const journals = await finValidator.getDocumentJournal(lcv.id);
    expect(journals.length).toBeGreaterThan(0);
    expect(journals[0].totalDebitPaise).toBe(journals[0].totalCreditPaise);
  });
});
