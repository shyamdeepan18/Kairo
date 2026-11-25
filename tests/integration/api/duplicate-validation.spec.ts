import { test, expect } from '@playwright/test';
import { ErpApiClient } from '../../helpers/api-client.js';
import { TestDataFactory } from '../../helpers/test-data-factory.js';

test.describe('Duplicate Entity & Constraint Error Handling', () => {
  let api: ErpApiClient;
  let factory: TestDataFactory;
  let companyId: string;

  test.beforeAll(async () => {
    api = new ErpApiClient();
    await api.login('shyam18@kairo.com', 'Shyam18');
    factory = new TestDataFactory(api);
    const ctx = await factory.getContext();
    companyId = ctx.companyId;
  });

  test('Duplicate Vendor ID / Supplier Code returns 409 Conflict with friendly warning message', async () => {
    const code = `DUP-VEND-${Date.now().toString().slice(-6)}`;
    const payload = {
      supplierCode: code,
      name: 'Duplicate Vendor QA Test',
      supplierType: 'unregistered',
    };

    // First creation must succeed with 201 Created
    const created = await api.post('/purchase/suppliers', payload);
    expect(created.id).toBeDefined();
    expect(created.supplierCode).toBe(code);

    // Second creation with the same code must return 409 Conflict with friendly warning
    let caughtError: any = null;
    try {
      await api.post('/purchase/suppliers', payload);
    } catch (err: any) {
      caughtError = err;
    }

    expect(caughtError).not.toBeNull();
    expect(caughtError.status).toBe(409);
    expect(caughtError.data.error).toContain(code);
    expect(caughtError.data.error).toMatch(/already exists for this company/i);
    expect(caughtError.data.statusCode).toBe(409);
    expect(caughtError.data.code).toBe('DUPLICATE_ENTITY');
  });

  test('Duplicate Customer Code returns 409 Conflict with friendly warning message', async () => {
    const code = `DUP-CUST-${Date.now().toString().slice(-6)}`;
    const payload = {
      customerCode: code,
      name: 'Duplicate Customer QA Test',
      customerType: 'unregistered',
    };

    const created = await api.post('/sales/customers', payload);
    expect(created.id).toBeDefined();

    let caughtError: any = null;
    try {
      await api.post('/sales/customers', payload);
    } catch (err: any) {
      caughtError = err;
    }

    expect(caughtError).not.toBeNull();
    expect(caughtError.status).toBe(409);
    expect(caughtError.data.error).toContain(code);
    expect(caughtError.data.error).toMatch(/already exists for this company/i);
    expect(caughtError.data.statusCode).toBe(409);
  });

  test('Duplicate Item Group Code returns 409 Conflict with friendly warning message', async () => {
    const code = `DUP-IG-${Date.now().toString().slice(-6)}`;
    const payload = {
      code,
      name: 'Duplicate Item Group QA Test',
    };

    const created = await api.post(`/masters/${companyId}/item-groups`, payload);
    expect(created.itemGroup?.id || created.id).toBeDefined();

    let caughtError: any = null;
    try {
      await api.post(`/masters/${companyId}/item-groups`, payload);
    } catch (err: any) {
      caughtError = err;
    }

    expect(caughtError).not.toBeNull();
    expect(caughtError.status).toBe(409);
    expect(caughtError.data.error).toContain(code);
    expect(caughtError.data.error).toMatch(/already exists for this company/i);
    expect(caughtError.data.statusCode).toBe(409);
  });
});
