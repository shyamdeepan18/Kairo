/**
 * Masters API client — wraps /api/masters/:companyId/*
 * Phase 2: suppliers, customers, items, item groups, UOM.
 */

import { api } from './client';

// ─── Types ────────────────────────────────────────────────────────────────────

export type PartyType = 'registered' | 'unregistered' | 'composition' | 'sez' | 'import' | 'export' | 'government';
export type MsmeType = 'micro' | 'small' | 'medium' | 'none';

export interface Supplier {
  id: string; companyId: string; supplierCode: string; name: string;
  legalName: string | null; supplierType: string;
  gstin: string | null; pan: string | null; stateCode: string | null;
  address: string | null; city: string | null; state: string | null; pincode: string | null;
  contactPerson: string | null; phone: string | null; email: string | null;
  paymentTermsDays: number; creditLimitPaise: number;
  incoterms: string | null; defaultLeadTimeDays: number;
  msmeType: MsmeType | null; msmeRegNo: string | null;
  bankAccountName: string | null; bankAccountNumber: string | null;
  bankIfsc: string | null; bankName: string | null;
  isActive: boolean;
}

export interface Customer {
  id: string; companyId: string; customerCode: string; name: string;
  legalName: string | null; customerType: string;
  gstin: string | null; pan: string | null; stateCode: string | null;
  contactPerson: string | null; phone: string | null; email: string | null;
  salesPersonId: string | null; customerTier: string | null;
  shippingTerms: string | null; preferredTransporter: string | null;
  paymentTermsDays: number; gracePeriodDays: number; creditLimitPaise: number; creditHold: boolean;
  defaultDiscountPercent: string;
  bankAccountName: string | null; bankAccountNumber: string | null;
  bankIfsc: string | null; bankName: string | null;
  isActive: boolean;
}

export interface CustomerAddress {
  id: string; customerId: string; addressType: string; label: string | null;
  gstin: string | null; stateCode: string | null;
  address: string | null; city: string | null; state: string | null; pincode: string | null;
  contactPerson: string | null; phone: string | null; isDefault: boolean; isActive: boolean;
}

export type ItemType = 'raw_material' | 'semi_finished' | 'finished' | 'consumable' | 'packing' | 'asset' | 'service';
export type TrackingType = 'none' | 'batch' | 'serial';
export type ValuationMethod = 'weighted_average' | 'fifo';

export interface Item {
  id: string; companyId: string; itemCode: string; itemName: string; description: string | null;
  itemType: string; itemGroupId: string | null;
  primaryUom: string; secondaryUom: string | null; conversionFactor: string | null;
  hsnSacCode: string | null; defaultTaxCodeId: string | null;
  barcode: string | null;
  isStockItem: boolean; trackingType: string; valuationMethod: string;
  shelfLifeDays: number; grossWeight: string | null; weightUom: string | null; isQcRequired: boolean;
  standardCostPaise: number; sellingPricePaise: number; minSellingPricePaise: number; purchaseRatePaise: number;
  reorderLevelQty: string; reorderQty: string; safetyStockQty: string; maxStockLevel: string;
  leadTimeDays: number; minOrderQty: string;
  isActive: boolean;
}

export interface ItemGroup {
  id: string; companyId: string; code: string; name: string; parentId: string | null; isActive: boolean;
}

export interface Uom {
  id: string; code: string; name: string; type: string; isActive: boolean;
}

export interface UomConversion {
  id: string; companyId: string | null; itemId: string | null;
  fromUom: string; toUom: string; factor: string; isActive: boolean;
}

export interface PartyTransaction {
  kind: string;
  documentNumber: string;
  postingDate: string;
  status: string;
  amountPaise: number;
}

// ─── Labels / constants ─────────────────────────────────────────────────────────

export const SUPPLIER_TYPES: { value: string; label: string }[] = [
  { value: 'registered', label: 'Registered' },
  { value: 'unregistered', label: 'Unregistered' },
  { value: 'composition', label: 'Composition' },
  { value: 'sez', label: 'SEZ' },
  { value: 'import', label: 'Import' },
  { value: 'government', label: 'Government' },
];

export const MSME_TYPES: { value: MsmeType; label: string; color: string }[] = [
  { value: 'micro', label: 'Micro Enterprise', color: 'blue' },
  { value: 'small', label: 'Small Enterprise', color: 'green' },
  { value: 'medium', label: 'Medium Enterprise', color: 'orange' },
  { value: 'none', label: 'Not Applicable', color: 'default' },
];

export const CUSTOMER_TYPES: { value: string; label: string }[] = [
  { value: 'registered', label: 'Registered (B2B)' },
  { value: 'unregistered', label: 'Unregistered (B2C)' },
  { value: 'composition', label: 'Composition' },
  { value: 'sez', label: 'SEZ' },
  { value: 'export', label: 'Export' },
  { value: 'government', label: 'Government' },
];

export const CUSTOMER_TIERS = [
  { value: 'retail', label: 'Retail Customer' },
  { value: 'wholesale', label: 'Wholesale / Stockist' },
  { value: 'distributor', label: 'Authorized Distributor' },
  { value: 'oem', label: 'OEM / Key Account' },
  { value: 'institutional', label: 'Institutional / Govt' },
];

export const SHIPPING_TERMS_OPTIONS = [
  { value: 'EXW', label: 'EXW - Ex Works (Factory Pick-up)' },
  { value: 'FOB', label: 'FOB - Free on Board' },
  { value: 'CIF', label: 'CIF - Cost, Insurance & Freight' },
  { value: 'Door Delivery', label: 'Door Delivery (Transporter Paid)' },
  { value: 'To-Pay', label: 'Freight To-Pay (Consignee Paid)' },
];

export const ITEM_TYPES: { value: ItemType; label: string; color: string }[] = [
  { value: 'raw_material', label: 'Raw Material', color: 'blue' },
  { value: 'semi_finished', label: 'Semi-Finished', color: 'gold' },
  { value: 'finished', label: 'Finished', color: 'green' },
  { value: 'consumable', label: 'Consumable', color: 'cyan' },
  { value: 'packing', label: 'Packing', color: 'purple' },
  { value: 'asset', label: 'Asset', color: 'magenta' },
  { value: 'service', label: 'Service', color: 'default' },
];

export const TRACKING_TYPES: { value: TrackingType; label: string }[] = [
  { value: 'none', label: 'None (qty only)' },
  { value: 'batch', label: 'Batch / Lot' },
  { value: 'serial', label: 'Serial number' },
];

export const UOM_DIMENSIONS = ['weight', 'volume', 'length', 'area', 'quantity', 'time', 'other'];

export const itemTypeMeta = (v: string) => ITEM_TYPES.find((t) => t.value === v);

// ─── API ──────────────────────────────────────────────────────────────────────

export const mastersApi = {
  // Suppliers
  listSuppliers: (companyId: string, q?: string) =>
    api.get<{ suppliers: Supplier[] }>(`/masters/${companyId}/suppliers`, { params: q ? { q } : undefined }).then((r) => r.data.suppliers),
  getSupplier: (companyId: string, id: string) =>
    api.get<{ supplier: Supplier }>(`/masters/${companyId}/suppliers/${id}`).then((r) => r.data.supplier),
  createSupplier: (companyId: string, body: Partial<Supplier>) =>
    api.post<{ supplier: Supplier }>(`/masters/${companyId}/suppliers`, body).then((r) => r.data.supplier),
  updateSupplier: (companyId: string, id: string, body: Partial<Supplier>) =>
    api.patch<{ supplier: Supplier }>(`/masters/${companyId}/suppliers/${id}`, body).then((r) => r.data.supplier),
  supplierTransactions: (companyId: string, id: string) =>
    api.get<{ transactions: PartyTransaction[] }>(`/masters/${companyId}/suppliers/${id}/transactions`).then((r) => r.data.transactions),

  // Customers
  listCustomers: (companyId: string, q?: string) =>
    api.get<{ customers: Customer[] }>(`/masters/${companyId}/customers`, { params: q ? { q } : undefined }).then((r) => r.data.customers),
  getCustomer: (companyId: string, id: string) =>
    api.get<{ customer: Customer; addresses: CustomerAddress[] }>(`/masters/${companyId}/customers/${id}`).then((r) => r.data),
  createCustomer: (companyId: string, body: Partial<Customer>) =>
    api.post<{ customer: Customer }>(`/masters/${companyId}/customers`, body).then((r) => r.data.customer),
  updateCustomer: (companyId: string, id: string, body: Partial<Customer>) =>
    api.patch<{ customer: Customer }>(`/masters/${companyId}/customers/${id}`, body).then((r) => r.data.customer),
  addCustomerAddress: (companyId: string, id: string, body: Partial<CustomerAddress>) =>
    api.post<{ address: CustomerAddress }>(`/masters/${companyId}/customers/${id}/addresses`, body).then((r) => r.data.address),
  customerTransactions: (companyId: string, id: string) =>
    api.get<{ transactions: PartyTransaction[] }>(`/masters/${companyId}/customers/${id}/transactions`).then((r) => r.data.transactions),

  // Item groups
  listItemGroups: (companyId: string) =>
    api.get<{ itemGroups: ItemGroup[] }>(`/masters/${companyId}/item-groups`).then((r) => r.data.itemGroups),
  createItemGroup: (companyId: string, body: { code: string; name: string; parentId?: string | null }) =>
    api.post<{ itemGroup: ItemGroup }>(`/masters/${companyId}/item-groups`, body).then((r) => r.data.itemGroup),
  updateItemGroup: (companyId: string, id: string, body: { name?: string; parentId?: string | null; isActive?: boolean }) =>
    api.patch<{ itemGroup: ItemGroup }>(`/masters/${companyId}/item-groups/${id}`, body).then((r) => r.data.itemGroup),

  // UOM
  listUom: (companyId: string) =>
    api.get<{ uom: Uom[]; conversions: UomConversion[] }>(`/masters/${companyId}/uom`).then((r) => r.data),
  createUom: (companyId: string, body: { code: string; name: string; type: string }) =>
    api.post<{ uom: Uom }>(`/masters/${companyId}/uom`, body).then((r) => r.data.uom),
  createUomConversion: (companyId: string, body: { fromUom: string; toUom: string; factor: number; itemId?: string }) =>
    api.post<{ conversion: UomConversion }>(`/masters/${companyId}/uom-conversions`, body).then((r) => r.data.conversion),

  // Items
  listItems: (companyId: string, params?: { q?: string; itemType?: string; groupId?: string }) =>
    api.get<{ items: Item[] }>(`/masters/${companyId}/items`, { params }).then((r) => r.data.items),
  getItem: (companyId: string, id: string) =>
    api.get<{ item: Item }>(`/masters/${companyId}/items/${id}`).then((r) => r.data.item),
  createItem: (companyId: string, body: Partial<Item>) =>
    api.post<{ item: Item }>(`/masters/${companyId}/items`, body).then((r) => r.data.item),
  updateItem: (companyId: string, id: string, body: Partial<Item>) =>
    api.patch<{ item: Item }>(`/masters/${companyId}/items/${id}`, body).then((r) => r.data.item),
};
