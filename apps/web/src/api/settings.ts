/**
 * Settings API client — wraps /api/settings/:companyId/*
 */

import { api } from './client';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CompanyDetail {
  id: string; name: string; legalName: string | null;
  gstin: string | null; pan: string | null;
  address: string | null; city: string | null; state: string | null;
  stateCode: string | null; pincode: string | null;
  phone: string | null; email: string | null; website: string | null;
  baseCurrency: string; financialYearStart: string;
}

export interface CompanyUser {
  id: string; email: string; fullName: string;
  isActive: boolean; lastLoginAt: string | null; createdAt: string;
  roles: { roleId: string; roleName: string; plantId: string | null }[];
}

export interface Role {
  id: string; name: string; description: string | null;
  isSystemRole: boolean; isActive: boolean; companyId: string | null;
}

export interface Account {
  id: string; code: string; name: string;
  accountType: string; normalBalance: string;
  parentId: string | null; isGroup: boolean;
  postingCategory: string | null;
  isSystemAccount: boolean; isActive: boolean;
}

export interface Plant {
  id: string; companyId: string; code: string; name: string;
  gstin: string | null; address: string | null; city: string | null;
  state: string | null; stateCode: string | null; pincode: string | null;
  phone: string | null; isActive: boolean;
}

export type WarehouseType =
  | 'raw_material' | 'work_in_progress' | 'finished_goods'
  | 'scrap' | 'transit' | 'consignment';

export interface Warehouse {
  id: string; plantId: string; companyId: string;
  code: string; name: string; warehouseType: WarehouseType;
  isDefault: boolean; isActive: boolean;
}

export interface NumberSeries {
  id: string; companyId: string; plantId: string | null; documentType: string;
  prefix: string; fiscalYear: string | null;
  includeFiscalYear: boolean; includePlantCode: boolean;
  padding: number; currentNumber: number; resetOnNewYear: boolean;
  isActive: boolean;
  plantCode?: string | null; preview?: string;
}

export interface TaxCode {
  id: string; companyId: string; code: string; name: string;
  rateType: string;
  gstRateBp: number; cgstRateBp: number; sgstRateBp: number;
  igstRateBp: number; cessRateBp: number;
  isSystemCode: boolean; isActive: boolean;
}

export interface HsnCode {
  id: string; code: string; description: string;
  isService: boolean; defaultGstRateBp: number; isActive: boolean;
}

export type CustomFieldType =
  | 'text' | 'textarea' | 'number' | 'integer' | 'date' | 'datetime'
  | 'select' | 'multiselect' | 'checkbox' | 'currency' | 'link';

export interface CustomFieldDef {
  id: string;
  fieldName: string;
  label: string;
  fieldType: CustomFieldType;
  scope: 'header' | 'line';
  required: boolean;
  showInList?: boolean;
  options?: string[];
  linkTo?: string;
  validations?: { minLength?: number; maxLength?: number; min?: number; max?: number; pattern?: string };
}

// ─── Company ──────────────────────────────────────────────────────────────────

export const settingsApi = {
  getCompany: (companyId: string) =>
    api.get<{ company: CompanyDetail }>(`/settings/${companyId}`).then((r) => r.data.company),

  updateCompany: (companyId: string, body: Partial<CompanyDetail>) =>
    api.patch<{ company: CompanyDetail }>(`/settings/${companyId}`, body).then((r) => r.data.company),

  // ── Users ──────────────────────────────────────────────────────────────────

  listUsers: (companyId: string) =>
    api.get<{ users: CompanyUser[] }>(`/settings/${companyId}/users`).then((r) => r.data.users),

  inviteUser: (companyId: string, body: { email: string; fullName: string; roleId: string; plantId?: string }) =>
    api.post<{ userId: string; tempPassword: string | null; message: string }>(
      `/settings/${companyId}/users/invite`, body
    ).then((r) => r.data),

  toggleUserActive: (companyId: string, userId: string, isActive: boolean) =>
    api.patch(`/settings/${companyId}/users/${userId}/toggle`, { isActive }).then((r) => r.data),

  // ── Roles ──────────────────────────────────────────────────────────────────

  listRoles: (companyId: string) =>
    api.get<{ roles: Role[] }>(`/settings/${companyId}/roles`).then((r) => r.data.roles),

  createRole: (companyId: string, body: { name: string; description?: string }) =>
    api.post<{ role: Role }>(`/settings/${companyId}/roles`, body).then((r) => r.data.role),

  getRolePermissions: (companyId: string, roleId: string) =>
    api.get<{ grantedCodes: string[] }>(`/settings/${companyId}/roles/${roleId}/permissions`)
      .then((r) => r.data.grantedCodes),

  setRolePermissions: (companyId: string, roleId: string, grantedCodes: string[]) =>
    api.put(`/settings/${companyId}/roles/${roleId}/permissions`, { grantedCodes }).then((r) => r.data),

  // ── Chart of accounts ──────────────────────────────────────────────────────

  listAccounts: (companyId: string) =>
    api.get<{ accounts: Account[] }>(`/settings/${companyId}/accounts`).then((r) => r.data.accounts),

  createAccount: (companyId: string, body: Omit<Account, 'id' | 'isSystemAccount' | 'isActive'>) =>
    api.post<{ account: Account }>(`/settings/${companyId}/accounts`, body).then((r) => r.data.account),

  updateAccount: (companyId: string, accountId: string, body: { name?: string; postingCategory?: string; isActive?: boolean }) =>
    api.patch<{ account: Account }>(`/settings/${companyId}/accounts/${accountId}`, body).then((r) => r.data.account),

  // ── Plants ───────────────────────────────────────────────────────────────────

  listPlants: (companyId: string) =>
    api.get<{ plants: Plant[] }>(`/settings/${companyId}/plants`).then((r) => r.data.plants),

  createPlant: (companyId: string, body: Partial<Plant> & { code: string; name: string }) =>
    api.post<{ plant: Plant }>(`/settings/${companyId}/plants`, body).then((r) => r.data.plant),

  updatePlant: (companyId: string, plantId: string, body: Partial<Plant>) =>
    api.patch<{ plant: Plant }>(`/settings/${companyId}/plants/${plantId}`, body).then((r) => r.data.plant),

  // ── Warehouses ───────────────────────────────────────────────────────────────

  listWarehouses: (companyId: string, plantId?: string) =>
    api.get<{ warehouses: Warehouse[] }>(`/settings/${companyId}/warehouses`, { params: plantId ? { plantId } : undefined })
      .then((r) => r.data.warehouses),

  createWarehouse: (companyId: string, body: { plantId: string; code: string; name: string; warehouseType?: WarehouseType; isDefault?: boolean }) =>
    api.post<{ warehouse: Warehouse }>(`/settings/${companyId}/warehouses`, body).then((r) => r.data.warehouse),

  updateWarehouse: (companyId: string, warehouseId: string, body: { code?: string; name?: string; warehouseType?: WarehouseType; isDefault?: boolean; isActive?: boolean }) =>
    api.patch<{ warehouse: Warehouse }>(`/settings/${companyId}/warehouses/${warehouseId}`, body).then((r) => r.data.warehouse),

  // ── Number series ──────────────────────────────────────────────────────────

  listNumberSeries: (companyId: string) =>
    api.get<{ series: NumberSeries[]; currentFiscalYear: string }>(`/settings/${companyId}/number-series`).then((r) => r.data),

  createNumberSeries: (companyId: string, body: {
    documentType: string; prefix: string; plantId?: string; fiscalYear?: string;
    includeFiscalYear?: boolean; includePlantCode?: boolean; padding?: number;
    currentNumber?: number; resetOnNewYear?: boolean;
  }) =>
    api.post<{ series: NumberSeries }>(`/settings/${companyId}/number-series`, body).then((r) => r.data.series),

  updateNumberSeries: (companyId: string, seriesId: string, body: Partial<NumberSeries>) =>
    api.patch<{ series: NumberSeries }>(`/settings/${companyId}/number-series/${seriesId}`, body).then((r) => r.data.series),

  // ── Tax codes & HSN ──────────────────────────────────────────────────────────

  listTaxCodes: (companyId: string) =>
    api.get<{ taxCodes: TaxCode[] }>(`/settings/${companyId}/tax-codes`).then((r) => r.data.taxCodes),

  createTaxCode: (companyId: string, body: { code: string; name: string; rateType: string; gstRateBp: number; cessRateBp?: number }) =>
    api.post<{ taxCode: TaxCode }>(`/settings/${companyId}/tax-codes`, body).then((r) => r.data.taxCode),

  updateTaxCode: (companyId: string, taxCodeId: string, body: { name?: string; isActive?: boolean }) =>
    api.patch<{ taxCode: TaxCode }>(`/settings/${companyId}/tax-codes/${taxCodeId}`, body).then((r) => r.data.taxCode),

  searchHsn: (companyId: string, q: string) =>
    api.get<{ hsnCodes: HsnCode[] }>(`/settings/${companyId}/hsn-codes`, { params: { q } }).then((r) => r.data.hsnCodes),

  // ── Custom fields ────────────────────────────────────────────────────────────

  listCustomFieldConfigs: (companyId: string) =>
    api.get<{ configured: { documentType: string; fieldCount: number }[] }>(`/settings/${companyId}/custom-fields`)
      .then((r) => r.data.configured),

  getCustomFields: (companyId: string, documentType: string) =>
    api.get<{ documentType: string; fields: CustomFieldDef[] }>(`/settings/${companyId}/custom-fields`, { params: { documentType } })
      .then((r) => r.data.fields),

  saveCustomFields: (companyId: string, documentType: string, fields: CustomFieldDef[]) =>
    api.put(`/settings/${companyId}/custom-fields`, { documentType, fields }).then((r) => r.data),
};

// ─── Shared constants ──────────────────────────────────────────────────────────

/** Document types available for number-series and custom-field configuration */
export const DOCUMENT_TYPES: { value: string; label: string }[] = [
  { value: 'purchase.pr',                  label: 'Purchase Requisition' },
  { value: 'purchase.po',                  label: 'Purchase Order' },
  { value: 'purchase.grn',                 label: 'Goods Receipt Note' },
  { value: 'purchase.invoice',             label: 'Purchase Invoice' },
  { value: 'purchase.payment',             label: 'Vendor Payment' },
  { value: 'sales.quotation',              label: 'Quotation' },
  { value: 'sales.so',                     label: 'Sales Order' },
  { value: 'sales.delivery',               label: 'Delivery Note' },
  { value: 'sales.invoice',                label: 'Sales Invoice' },
  { value: 'sales.receipt',                label: 'Customer Receipt' },
  { value: 'inventory.adjustment',         label: 'Stock Adjustment' },
  { value: 'inventory.transfer',           label: 'Stock Transfer' },
  { value: 'manufacturing.production_order', label: 'Production Order' },
  { value: 'manufacturing.process_batch',  label: 'Process Batch' },
  { value: 'accounting.jv',                label: 'Journal Voucher' },
];

export const docTypeLabel = (value: string) =>
  DOCUMENT_TYPES.find((d) => d.value === value)?.label ?? value;

export const WAREHOUSE_TYPES: { value: WarehouseType; label: string; color: string }[] = [
  { value: 'raw_material',     label: 'Raw Material',     color: 'blue' },
  { value: 'work_in_progress', label: 'Work In Progress', color: 'gold' },
  { value: 'finished_goods',   label: 'Finished Goods',   color: 'green' },
  { value: 'scrap',            label: 'Scrap',            color: 'red' },
  { value: 'transit',          label: 'Transit',          color: 'purple' },
  { value: 'consignment',      label: 'Consignment',      color: 'cyan' },
];
