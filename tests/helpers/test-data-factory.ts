import { ErpApiClient } from './api-client.js';

export interface TestContext {
  companyId: string;
  plantId: string;
  warehouseId: string;
}

export class TestDataFactory {
  private api: ErpApiClient;

  constructor(api: ErpApiClient) {
    this.api = api;
  }

  /**
   * Discovers default test context (Company 1, PL01, WH-o1 Raw WH)
   */
  async getContext(): Promise<TestContext> {
    const res = await this.api.get<{ companies: Array<{ id: string; name: string }> }>('/auth/context-options');
    const comp = res.companies.find((c) => c.name.includes('Company 1')) || res.companies[0];
    if (!comp) throw new Error('No companies available for testing');

    const plantsRes = await this.api.get<{ plants: Array<{ id: string; name: string }> }>(`/companies/${comp.id}/plants`);
    const plant = plantsRes.plants[0];
    if (!plant) throw new Error(`No plants found for company ${comp.id}`);

    // Select context
    await this.api.selectContext(comp.id, plant.id);

    // Get warehouses
    const whRes = await this.api.get<{ warehouses: Array<{ id: string; code: string; name: string; warehouseType: string }> }>(
      `/settings/${comp.id}/warehouses?plantId=${plant.id}`
    );
    const rawWh = whRes.warehouses?.find((w) => w.code.includes('Raw') || w.code.includes('WH-o1') || w.warehouseType === 'raw_material') || whRes.warehouses?.[0];

    return {
      companyId: comp.id,
      plantId: plant.id,
      warehouseId: rawWh?.id,
    };
  }

  async createSupplier(prefix: string) {
    const clean = prefix.replace(/[^a-zA-Z0-9]/g, '').slice(-8);
    const code = `SUP-${clean}-${Math.floor(Math.random() * 10000)}`;
    const res = await this.api.post(`/purchase/suppliers`, {
      supplierCode: code,
      name: `${prefix} Supplier Pvt Ltd`,
      supplierType: 'registered',
      gstin: '29ABCDE1234F1Z5',
      stateCode: '29',
      paymentTermsDays: 30,
      creditLimitPaise: 10000000,
    });
    return res.data || res.supplier || res;
  }

  async createCustomer(prefix: string) {
    const clean = prefix.replace(/[^a-zA-Z0-9]/g, '').slice(-8);
    const code = `CUST-${clean}-${Math.floor(Math.random() * 10000)}`;
    const res = await this.api.post(`/sales/customers`, {
      customerCode: code,
      name: `${prefix} Customer Corp`,
      customerType: 'registered',
      gstin: '29ABCDE1234F1Z5',
      stateCode: '29',
      paymentTermsDays: 15,
      creditLimitPaise: 50000000,
    });
    return res.data || res.customer || res;
  }

  async createItem(prefix: string, options: { itemType?: string; isStockItem?: boolean; purchaseRatePaise?: number; sellingPricePaise?: number } = {}) {
    const clean = prefix.replace(/[^a-zA-Z0-9]/g, '').slice(-10);
    const code = `ITEM-${clean}-${Math.floor(Math.random() * 10000)}`;
    const compId = this.api.companyId;
    const res = await this.api.post(`/masters/${compId}/items`, {
      itemCode: code,
      itemName: `${prefix} Industrial Widget`,
      itemType: options.itemType || 'raw_material',
      primaryUom: 'NOS',
      isStockItem: options.isStockItem !== undefined ? options.isStockItem : true,
      purchaseRatePaise: options.purchaseRatePaise || 50000, // 500 INR
      sellingPricePaise: options.sellingPricePaise || 80000, // 800 INR
      standardCostPaise: options.purchaseRatePaise || 50000,
      reorderLevelQty: 10,
      reorderQty: 50,
      safetyStockQty: 5,
      maxStockLevel: 500,
      minOrderQty: 1,
    });
    return res.item || res.data || res;
  }
}
