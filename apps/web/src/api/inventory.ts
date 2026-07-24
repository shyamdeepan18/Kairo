import { api } from './client';
const BASE = '/inventory';
export const inventoryApi = {
  stockBalances: {
    list: (companyId: string, params?: Record<string, unknown>) =>
      api.get(`${BASE}/stock-balances`, { params: { companyId, ...params } }).then((r) => r.data),
  },
  stockLedger: {
    list: (companyId: string, params?: Record<string, unknown>) =>
      api.get(`${BASE}/stock-ledger`, { params: { companyId, ...params } }).then((r) => r.data),
  },
  adjustments: {
    list:   (companyId: string, params?: Record<string, unknown>) =>
      api.get(`${BASE}/adjustments`, { params: { companyId, ...params } }).then((r) => r.data),
    get:    (companyId: string, id: string) =>
      api.get(`${BASE}/adjustments/${id}`, { params: { companyId } }).then((r) => r.data),
    create: (body: Record<string, unknown>) =>
      api.post(`${BASE}/adjustments`, body).then((r) => r.data),
    submit: (id: string, companyId: string) =>
      api.post(`${BASE}/adjustments/${id}/submit`, {}, { params: { companyId } }).then((r) => r.data),
    approve: (id: string, companyId: string) =>
      api.post(`${BASE}/adjustments/${id}/approve`, {}, { params: { companyId } }).then((r) => r.data),
    reject:  (id: string, companyId: string) =>
      api.post(`${BASE}/adjustments/${id}/reject`, {}, { params: { companyId } }).then((r) => r.data),
  },
  transfers: {
    list:   (companyId: string, params?: Record<string, unknown>) =>
      api.get(`${BASE}/transfers`, { params: { companyId, ...params } }).then((r) => r.data),
    get:    (companyId: string, id: string) =>
      api.get(`${BASE}/transfers/${id}`, { params: { companyId } }).then((r) => r.data),
    create: (body: Record<string, unknown>) =>
      api.post(`${BASE}/transfers`, body).then((r) => r.data),
    submit: (id: string, companyId: string) =>
      api.post(`${BASE}/transfers/${id}/submit`, {}, { params: { companyId } }).then((r) => r.data),
    approve: (id: string, companyId: string) =>
      api.post(`${BASE}/transfers/${id}/approve`, {}, { params: { companyId } }).then((r) => r.data),
    reject:  (id: string, companyId: string) =>
      api.post(`${BASE}/transfers/${id}/reject`, {}, { params: { companyId } }).then((r) => r.data),
  },
};

export const invErr = (e: any): string =>
  e?.response?.data?.message ?? e?.response?.data?.error ?? e?.response?.data?.detail ?? 'Request failed';
