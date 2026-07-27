/**
 * Sales API client — wraps /api/sales/* (Phase 7 backend).
 *
 * Company context: companyId as query param on GETs, inside body on POSTs
 * (same convention as api/purchase.ts — resolveCompany reads it).
 */
import { api } from './client';

const BASE = '/sales';

// ─── Shared shapes ──────────────────────────────────────────────────────────

export interface Paginated<T> { data: T[]; total: number; page: number; pageSize: number }

export interface SalesHeader {
  id: string;
  companyId: string;
  plantId: string;
  documentNumber: string;
  status: string;
  postingDate: string;
  customerId?: string;
  netAmountPaise: number;
  taxAmountPaise: number;
  totalAmountPaise: number;
  remarks: string | null;
  createdAt: string;
  // SO-specific
  deliveredQty?: number;
  deliveryStatus?: string;
  billingStatus?: string;
  // Invoice-specific
  einvoiceStatus?: string;
  receivedAmountPaise?: number;
  paidAmountPaise?: number;
  paymentStatus?: string;
}

export interface SalesLineInput {
  itemId: string;
  description?: string;
  quantity: number;
  uom: string;
  ratePaise: number;
  discountPercent?: number;
  discountPaise?: number;
  taxCodeId?: string;
  hsnSacCode?: string;
  cgstAmountPaise?: number;
  sgstAmountPaise?: number;
  igstAmountPaise?: number;
  cessAmountPaise?: number;
  warehouseId?: string;
}

export type SalesAction = 'submit' | 'approve' | 'reject' | 'cancel';

// ─── Generic helpers ────────────────────────────────────────────────────────

// NOTE: companyId is derived server-side from the session/JWT (tenant context)
// and is no longer sent on the wire. The `_companyId` params are retained only
// to avoid churning every call site; they are intentionally unused.
const listDocs = <T = SalesHeader>(path: string, _companyId: string, params?: Record<string, unknown>) =>
  api.get<Paginated<T>>(`${BASE}/${path}`, { params: { ...(params ?? {}) } }).then((r) => r.data);

const getDoc = <T = any>(path: string, _companyId: string, id: string) =>
  api.get<T>(`${BASE}/${path}/${id}`).then((r) => r.data);

const createDoc = <T = any>(path: string, body: Record<string, unknown>) =>
  api.post<T>(`${BASE}/${path}`, body).then((r) => r.data);

const act = (path: string, id: string, action: SalesAction, _companyId: string, remarks?: string) =>
  api.post(`${BASE}/${path}/${id}/${action}`, { remarks }).then((r) => r.data);

// ─── Customer (exposed by sales module) ─────────────────────────────────────

export interface Customer {
  id: string; companyId: string; customerCode: string; name: string;
  customerType: string; gstin: string | null; stateCode: string | null; isActive: boolean;
}

// ─── Exported API ───────────────────────────────────────────────────────────

export const salesApi = {
  customers: {
    list: (companyId: string, q?: string) => listDocs<Customer>('customers', companyId, q ? { q } : undefined),
    get: (companyId: string, id: string) => getDoc<Customer>('customers', companyId, id),
    create: (body: Record<string, unknown>) => createDoc<Customer>('customers', body),
    update: (id: string, body: Record<string, unknown>) =>
      api.patch(`${BASE}/customers/${id}`, body).then((r) => r.data),
  },

  quotations: {
    list: (companyId: string, params?: Record<string, unknown>) => listDocs('quotations', companyId, params),
    get: (companyId: string, id: string) => getDoc('quotations', companyId, id),
    create: (body: Record<string, unknown>) => createDoc('quotations', body),
    act: (id: string, action: SalesAction, companyId: string, remarks?: string) => act('quotations', id, action, companyId, remarks),
  },

  orders: {
    list: (companyId: string, params?: Record<string, unknown>) => listDocs('orders', companyId, params),
    get: (companyId: string, id: string) => getDoc('orders', companyId, id),
    create: (body: Record<string, unknown>) => createDoc('orders', body),
    act: (id: string, action: SalesAction, companyId: string, remarks?: string) => act('orders', id, action, companyId, remarks),
  },

  deliveries: {
    list: (companyId: string, params?: Record<string, unknown>) => listDocs('deliveries', companyId, params),
    get: (companyId: string, id: string) => getDoc('deliveries', companyId, id),
    create: (body: Record<string, unknown>) => createDoc('deliveries', body),
    act: (id: string, action: SalesAction, companyId: string, remarks?: string) => act('deliveries', id, action, companyId, remarks),
  },

  invoices: {
    list: (companyId: string, params?: Record<string, unknown>) => listDocs('invoices', companyId, params),
    get: (companyId: string, id: string) => getDoc('invoices', companyId, id),
    create: (body: Record<string, unknown>) => createDoc('invoices', body),
    act: (id: string, action: SalesAction, companyId: string, remarks?: string) => act('invoices', id, action, companyId, remarks),
  },

  receipts: {
    list: (companyId: string, params?: Record<string, unknown>) => listDocs('receipts', companyId, params),
    get: (companyId: string, id: string) => getDoc('receipts', companyId, id),
    create: (body: Record<string, unknown>) => createDoc('receipts', body),
    act: (id: string, action: SalesAction, companyId: string, remarks?: string) => act('receipts', id, action, companyId, remarks),
  },
};
