import { test, expect } from '@playwright/test';
import { ErpApiClient } from '../../helpers/api-client.js';
import { DbValidator } from '../../helpers/db-validator.js';
import { TestDataFactory } from '../../helpers/test-data-factory.js';

test.describe('Subcontracting & Outside Job Work (GAP 4) Lifecycle', () => {
  let api: ErpApiClient;
  let dbValidator: DbValidator;
  let factory: TestDataFactory;
  const testId = `JWO-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 1000)}`;

  test.beforeAll(async () => {
    api = new ErpApiClient();
    await api.login('shyam18@kairo.com', 'Shyam18');
    dbValidator = new DbValidator();
    factory = new TestDataFactory(api);
  });

  test.afterAll(async () => {
    await dbValidator.close();
  });

  test('Subcontracting Flow: Vendor -> JWO -> Outward Challan -> Inward Receipt & Cost Capitalization', async () => {
    const ctx = await factory.getContext();
    const today = new Date().toISOString().slice(0, 10);

    // 1. Create Subcontractor Vendor Master
    const vendor = await factory.createSupplier(testId);
    expect(vendor.id).toBeDefined();

    // 2. Create Raw Component Item (e.g. Raw Billet)
    const rawRatePaise = 40000; // 400 INR
    const rawItem = await factory.createItem(`${testId}-RAW`, {
      itemType: 'raw_material',
      purchaseRatePaise: rawRatePaise,
    });

    // 3. Create Processed Output Item (e.g. Machined Shaft)
    const targetItem = await factory.createItem(`${testId}-FG`, {
      itemType: 'finished_goods',
      sellingPricePaise: 120000,
    });

    // 4. Inward raw material stock to plant warehouse
    const inwardQty = 30;
    const initialGrn = await api.post('/purchase/grns', {
      plantId: ctx.plantId,
      warehouseId: ctx.warehouseId,
      supplierId: vendor.id,
      postingDate: today,
      supplierDcNo: `INWARD-RAW-${testId}`,
      lines: [
        {
          itemId: rawItem.id,
          uom: 'NOS',
          receivedQty: inwardQty,
          acceptedQty: inwardQty,
          ratePaise: rawRatePaise,
        },
      ],
    });
    const grnData = initialGrn.data || initialGrn.grn || initialGrn;
    await api.post(`/purchase/grns/${grnData.id}/submit`);
    await api.post(`/purchase/grns/${grnData.id}/approve`);

    // Verify Raw Material Stock is present
    const rawBal = await dbValidator.getStockBalance(rawItem.id, ctx.warehouseId);
    expect(Number(rawBal.quantity_on_hand)).toBeGreaterThanOrEqual(inwardQty);

    // 5. Ensure Vendor Virtual Warehouse exists
    const whListRes = await api.get<{ warehouses: Array<{ id: string; code: string; warehouseType: string }> }>(
      `/settings/${ctx.companyId}/warehouses?plantId=${ctx.plantId}`
    );
    let vendorWh = whListRes.warehouses?.find((w) => w.warehouseType === 'consignment' || w.code.includes('VEND'));
    if (!vendorWh) {
      // Create dedicated consignment warehouse for subcontractor
      const createWhRes = await api.post(`/settings/${ctx.companyId}/warehouses`, {
        plantId: ctx.plantId,
        code: `WH-SC-${Date.now().toString().slice(-6)}`,
        name: `Subcon Virtual WH ${testId.slice(-4)}`,
        warehouseType: 'consignment',
      });
      vendorWh = createWhRes.warehouse || createWhRes.data || createWhRes;
    }
    expect(vendorWh?.id).toBeDefined();

    // 6. Create Job Work Order (JWO)
    const jobQty = 10;
    const serviceRatePaise = 15000; // 150 INR processing fee per unit
    const jwoRes = await api.post('/manufacturing/job-work-orders', {
      plantId: ctx.plantId,
      vendorId: vendor.id,
      vendorWarehouseId: vendorWh!.id,
      targetItemId: targetItem.id,
      targetQty: jobQty,
      uom: 'NOS',
      serviceRatePaise,
      postingDate: today,
      remarks: `${testId} Outside Processing Agreement`,
      materials: [
        {
          itemId: rawItem.id,
          plannedQty: jobQty,
          uom: 'NOS',
        },
      ],
    });
    const jwo = jwoRes.data || jwoRes.order || jwoRes;
    expect(jwo.id).toBeDefined();
    expect(jwo.status).toBe('draft');

    // 7. Negative Invariant Validation: Outward Challan MUST reject unapproved JWO
    let caughtChallanErr: any = null;
    try {
      await api.post('/manufacturing/job-work-challans', {
        plantId: ctx.plantId,
        postingDate: today,
        jobWorkOrderId: jwo.id,
        sourceWarehouseId: ctx.warehouseId,
        vehicleNumber: 'KA-01-SUBCON',
        lines: [
          {
            itemId: rawItem.id,
            quantity: jobQty,
            uom: 'NOS',
          },
        ],
      });
    } catch (err: any) {
      caughtChallanErr = err;
    }
    expect(caughtChallanErr).not.toBeNull();
    expect(caughtChallanErr.message).toContain('Job work order must be approved or in progress');

    // 8. Submit and Approve JWO (Verified fix for BUG-001)
    const submitJwoRes = await api.post(`/manufacturing/job-work-orders/${jwo.id}/submit`);
    expect(submitJwoRes.status || submitJwoRes.ok).toBeTruthy();

    const approveJwoRes = await api.post(`/manufacturing/job-work-orders/${jwo.id}/approve`);
    expect(approveJwoRes.status).toBe('approved');

    // 9. Create Outward Subcontracting Challan (Material Issue to Subcontractor)
    const challanRes = await api.post('/manufacturing/job-work-challans', {
      plantId: ctx.plantId,
      postingDate: today,
      jobWorkOrderId: jwo.id,
      sourceWarehouseId: ctx.warehouseId,
      vehicleNumber: 'KA-01-SUBCON-1234',
      lines: [
        {
          itemId: rawItem.id,
          quantity: jobQty,
          uom: 'NOS',
        },
      ],
    });
    const challan = challanRes.data || challanRes;
    expect(challan.id).toBeDefined();

    // Verify JWO status transitioned to 'in_progress'
    const jwoAfterChallan = await api.get(`/manufacturing/job-work-orders/${jwo.id}`);
    expect(jwoAfterChallan.status).toBe('in_progress');

    // Verify raw stock in plant warehouse decreased by jobQty
    const rawPlantBal = await dbValidator.getStockBalance(rawItem.id, ctx.warehouseId);
    expect(Number(rawPlantBal.quantity_on_hand)).toBe(inwardQty - jobQty);

    // Verify raw stock in vendor consignment warehouse increased by jobQty
    const rawVendorBal = await dbValidator.getStockBalance(rawItem.id, vendorWh!.id);
    expect(Number(rawVendorBal.quantity_on_hand)).toBe(jobQty);

    // 10. Inward Subcontracting Receipt & Cost Capitalization
    const receiptRes = await api.post('/manufacturing/job-work-receipts', {
      plantId: ctx.plantId,
      jobWorkOrderId: jwo.id,
      postingDate: today,
      destinationWarehouseId: ctx.warehouseId,
      receivedQty: jobQty,
      uom: 'NOS',
      remarks: `${testId} Completed subcontracting processing receipt`,
    });
    const receipt = receiptRes.data || receiptRes;
    expect(receipt.id).toBeDefined();

    // Verify Finished Goods stock in plant warehouse increased by jobQty
    const fgPlantBal = await dbValidator.getStockBalance(targetItem.id, ctx.warehouseId);
    expect(Number(fgPlantBal.quantity_on_hand)).toBe(jobQty);

    // Verify raw material consumed from vendor warehouse (decreased to 0)
    const rawVendorBalAfter = await dbValidator.getStockBalance(rawItem.id, vendorWh!.id);
    expect(Number(rawVendorBalAfter.quantity_on_hand)).toBe(0);

    // Verify double-entry GL balance for receipt journal entry
    if (receipt.journalEntryId) {
      await dbValidator.verifyJournalForDocument(receipt.journalEntryId);
    }
  });
});
