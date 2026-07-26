/**
 * Purchase API client — wraps /api/purchase/* (Phase 6 backend).
 *
 * NOTE on company context: unlike the masters API (path-scoped /masters/:companyId/*),
 * the transaction routes resolve the company from the request itself — so we pass
 * `companyId` as a query param on GETs and inside the body on POSTs. The backend's
 * resolveCompany + requireModule middleware read it from there.
 */
import { api } from './client';

const BASE = '/purchase';

// ─── Shared shapes ──────────────────────────────────────────────────────────

export interface Paginated<T> { data: T[]; total: number; page: number; pageSize: number }

export interface PurchaseHeader {
  id: string;
  companyId: string;
  plantId: string;
  documentNumber: string;
  status: string;
  postingDate: string;
  supplierId?: string;
  supplierInvoiceNumber?: string;
  netAmountPaise: number;
  taxAmountPaise: number;
  totalAmountPaise: number;
  remarks: string | null;
  purpose?: string | null;
  createdAt: string;
  createdBy?: string;
  submittedBy?: string;
  createdByName?: string;
  submittedByName?: string;
}

export interface PurchaseLineInput {
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

export type PurchaseAction = 'submit' | 'approve' | 'reject' | 'cancel';

// ─── Generic helpers (one shape per backend route family) ──────────────────

const listDocs = <T = PurchaseHeader>(path: string, companyId: string, params?: Record<string, unknown>) =>
  api.get<Paginated<T>>(`${BASE}/${path}`, { params: { companyId, ...(params ?? {}) } }).then((r) => r.data);

const getDoc = <T = any>(path: string, companyId: string, id: string) =>
  api.get<T>(`${BASE}/${path}/${id}`, { params: { companyId } }).then((r) => r.data);

const createDoc = <T = any>(path: string, body: Record<string, unknown>) =>
  api.post<T>(`${BASE}/${path}`, body).then((r) => r.data);

const updateDoc = <T = any>(path: string, id: string, body: Record<string, unknown>) =>
  api.put<T>(`${BASE}/${path}/${id}`, body).then((r) => r.data);


/** Lifecycle transition — companyId travels in the body (resolveCompany reads it). */
const act = (path: string, id: string, action: PurchaseAction, companyId: string, remarks?: string) =>
  api.post(`${BASE}/${path}/${id}/${action}`, { companyId, remarks }).then((r) => r.data);

// ─── Suppliers (vendor master, exposed by the purchase module) ──────────────

export interface Supplier {
  id: string; companyId: string; supplierCode: string; name: string;
  supplierType: string; gstin: string | null; stateCode: string | null; isActive: boolean;
}

export const purchaseApi = {
  suppliers: {
    list: (companyId: string, q?: string) => listDocs<Supplier>('suppliers', companyId, q ? { q } : undefined),
    get: (companyId: string, id: string) => getDoc<Supplier>('suppliers', companyId, id),
    create: (body: Record<string, unknown>) => createDoc<Supplier>('suppliers', body),
    update: (id: string, body: Record<string, unknown>) =>
      api.patch(`${BASE}/suppliers/${id}`, body).then((r) => r.data),
  },

  requisitions: {
    list: (companyId: string, params?: Record<string, unknown>) => listDocs('requisitions', companyId, params),
    pendingLines: (companyId: string) => api.get(`${BASE}/requisitions/pending-lines`, { params: { companyId } }).then((r) => r.data),
    get: (companyId: string, id: string) => getDoc('requisitions', companyId, id),
    create: (body: Record<string, unknown>) => createDoc('requisitions', body),
    act: (id: string, action: PurchaseAction, companyId: string, remarks?: string) => act('requisitions', id, action, companyId, remarks),
  },

  orders: {
    list: (companyId: string, params?: Record<string, unknown>) => listDocs('orders', companyId, params),
    get: (companyId: string, id: string) => getDoc('orders', companyId, id),
    create: (body: Record<string, unknown>) => createDoc('orders', body),
    update: (id: string, body: Record<string, unknown>) => updateDoc('orders', id, body),
    act: (id: string, action: PurchaseAction, companyId: string, remarks?: string) => act('orders', id, action, companyId, remarks),
  },

  grns: {
    list: (companyId: string, params?: Record<string, unknown>) => listDocs('grns', companyId, params),
    get: (companyId: string, id: string) => getDoc('grns', companyId, id),
    create: (body: Record<string, unknown>) => createDoc('grns', body),
    act: (id: string, action: PurchaseAction, companyId: string, remarks?: string) => act('grns', id, action, companyId, remarks),
  },

  invoices: {
    list: (companyId: string, params?: Record<string, unknown>) => listDocs('invoices', companyId, params),
    get: (companyId: string, id: string) => getDoc('invoices', companyId, id),
    create: (body: Record<string, unknown>) => createDoc('invoices', body),
    act: (id: string, action: PurchaseAction, companyId: string, remarks?: string) => act('invoices', id, action, companyId, remarks),
  },

  payments: {
    list: (companyId: string, params?: Record<string, unknown>) => listDocs('payments', companyId, params),
    get: (companyId: string, id: string) => getDoc('payments', companyId, id),
    create: (body: Record<string, unknown>) => createDoc('payments', body),
    act: (id: string, action: PurchaseAction, companyId: string, remarks?: string) => act('payments', id, action, companyId, remarks),
  },
};

// ─── Line math (mirrors the backend computeLine) ────────────────────────────

export interface ComputedLine {
  netAmountPaise: number;
  cgstAmountPaise: number;
  sgstAmountPaise: number;
  taxAmountPaise: number;
  totalAmountPaise: number;
}

/**
 * Compute a line client-side. Tax is derived from the GST rate (basis points)
 * and split CGST+SGST (intra-state assumption for v1). The backend re-stores
 * exactly what we send.
 */
export function computeLine(qty: number, ratePaise: number, discountPercent = 0, gstRateBp = 0): ComputedLine {
  const gross = Math.round(qty * ratePaise);
  const discount = Math.round((gross * discountPercent) / 100);
  const net = gross - discount;
  const gst = Math.round((net * gstRateBp) / 10000);
  const cgst = Math.round(gst / 2);
  const sgst = gst - cgst;
  return {
    netAmountPaise: net,
    cgstAmountPaise: cgst,
    sgstAmountPaise: sgst,
    taxAmountPaise: gst,
    totalAmountPaise: net + gst,
  };
}

export const apiErr = (e: any): string => {
  const data = e?.response?.data;
  if (data?.details) {
    return `${data.error || 'Error'}: ${JSON.stringify(data.details)}`;
  }
  return data?.message ?? data?.error ?? data?.detail ?? e?.message ?? 'Request failed';
};
