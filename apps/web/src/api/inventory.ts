import { api } from './client';
const BASE = '/inventory';

// NOTE: companyId is derived server-side from the session/JWT (tenant context)
// and is no longer sent on the wire. The `_companyId` params are retained only
// to avoid churning every call site; they are intentionally unused.
export const inventoryApi = {
  stockBalances: {
    list: (_companyId: string, params?: Record<string, unknown>) =>
      api.get(`${BASE}/stock-balances`, { params: { ...params } }).then((r) => r.data),
  },
  stockLedger: {
    list: (_companyId: string, params?: Record<string, unknown>) =>
      api.get(`${BASE}/stock-ledger`, { params: { ...params } }).then((r) => r.data),
  },
  adjustments: {
    list:   (_companyId: string, params?: Record<string, unknown>) =>
      api.get(`${BASE}/adjustments`, { params: { ...params } }).then((r) => r.data),
    get:    (_companyId: string, id: string) =>
      api.get(`${BASE}/adjustments/${id}`).then((r) => r.data),
    create: (body: Record<string, unknown>) =>
      api.post(`${BASE}/adjustments`, body).then((r) => r.data),
    submit: (id: string, _companyId: string) =>
      api.post(`${BASE}/adjustments/${id}/submit`, {}).then((r) => r.data),
    approve: (id: string, _companyId: string) =>
      api.post(`${BASE}/adjustments/${id}/approve`, {}).then((r) => r.data),
    reject:  (id: string, _companyId: string) =>
      api.post(`${BASE}/adjustments/${id}/reject`, {}).then((r) => r.data),
  },
  transfers: {
    list:   (_companyId: string, params?: Record<string, unknown>) =>
      api.get(`${BASE}/transfers`, { params: { ...params } }).then((r) => r.data),
    get:    (_companyId: string, id: string) =>
      api.get(`${BASE}/transfers/${id}`).then((r) => r.data),
    create: (body: Record<string, unknown>) =>
      api.post(`${BASE}/transfers`, body).then((r) => r.data),
    submit: (id: string, _companyId: string) =>
      api.post(`${BASE}/transfers/${id}/submit`, {}).then((r) => r.data),
    approve: (id: string, _companyId: string) =>
      api.post(`${BASE}/transfers/${id}/approve`, {}).then((r) => r.data),
    receive: (id: string, _companyId: string) =>
      api.post(`${BASE}/transfers/${id}/receive`, {}).then((r) => r.data),
    reject:  (id: string, _companyId: string) =>
      api.post(`${BASE}/transfers/${id}/reject`, {}).then((r) => r.data),
  },
};

export const invErr = (e: any): string =>
  e?.response?.data?.message ?? e?.response?.data?.error ?? e?.response?.data?.detail ?? 'Request failed';
