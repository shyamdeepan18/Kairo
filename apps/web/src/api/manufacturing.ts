/**
 * Manufacturing API client — wraps /api/manufacturing/* (Phase 8 backend).
 *
 * Company context follows the same pattern as purchase/sales:
 * companyId as query param on GETs, inside body on POSTs.
 */
import { api } from './client';

const BASE = '/manufacturing';

// ─── Shapes ─────────────────────────────────────────────────────────────────

export interface Paginated<T> { data: T[]; total: number; page: number; pageSize: number }

export interface WorkCenter {
  id: string; companyId: string; code: string; name: string;
  labourRatePaisePerHr: number; machineRatePaisePerHr: number;
  overheadRatePaisePerHr: number; isActive: boolean;
}

export interface FormulaHeader {
  id: string; companyId: string; documentNumber: string;
  formulaCode: string; formulaName: string; formulaType: string;
  outputItemId: string; batchSizeQty: string; batchSizeUom: string;
  status: string; createdAt: string;
}

export interface FormulaInput {
  id: string; itemId: string; quantity: string; uom: string;
  wastagePercent: string; isOptional: boolean; description: string | null;
}

export interface FormulaOutput {
  id: string; itemId: string; expectedQty: string; uom: string;
  outputType: string; allocationPercent: string; description: string | null;
}

export interface FormulaOperation {
  id: string; operationNumber: number; name: string;
  workCenterId: string | null; setupTimeMin: number;
  runTimePerUnitMin: string; description: string | null;
}

export interface ProductionOrder {
  id: string; companyId: string; plantId: string;
  documentNumber: string; formulaId: string; status: string;
  plannedQty: string; actualQty: string | null;
  plannedStartDate: string; plannedEndDate: string | null;
  actualStartDate: string | null; actualEndDate: string | null;
  warehouseId: string | null; outputWarehouseId: string | null;
  totalMaterialCostPaise: number; totalLabourCostPaise: number;
  totalMachineCostPaise: number; totalOverheadCostPaise: number;
  totalCostPaise: number;
  createdAt: string;
}

export type MfgAction = 'submit' | 'approve' | 'reject' | 'cancel';

// ─── Generic helpers ────────────────────────────────────────────────────────

const listDocs = <T>(path: string, companyId: string, params?: Record<string, unknown>) =>
  api.get<Paginated<T>>(`${BASE}/${path}`, { params: { companyId, ...(params ?? {}) } }).then((r) => r.data);

const getDoc = <T = any>(path: string, companyId: string, id: string) =>
  api.get<T>(`${BASE}/${path}/${id}`, { params: { companyId } }).then((r) => r.data);

const createDoc = <T = any>(path: string, body: Record<string, unknown>) =>
  api.post<T>(`${BASE}/${path}`, body).then((r) => r.data);

const act = (path: string, id: string, action: string, companyId: string, body?: Record<string, unknown>) =>
  api.post(`${BASE}/${path}/${id}/${action}`, { companyId, ...(body ?? {}) }).then((r) => r.data);

// ─── Exported API ───────────────────────────────────────────────────────────

export const manufacturingApi = {
  workCenters: {
    list: (companyId: string) => listDocs<WorkCenter>('work-centers', companyId),
    get: (companyId: string, id: string) => getDoc<WorkCenter>('work-centers', companyId, id),
    create: (body: Record<string, unknown>) => createDoc<WorkCenter>('work-centers', body),
    update: (id: string, body: Record<string, unknown>) =>
      api.patch(`${BASE}/work-centers/${id}`, body).then((r) => r.data),
  },

  formulas: {
    list: (companyId: string, params?: Record<string, unknown>) => listDocs<FormulaHeader>('formulas', companyId, params),
    get: (companyId: string, id: string) => getDoc<FormulaHeader & { inputs: FormulaInput[]; outputs: FormulaOutput[]; operations: FormulaOperation[] }>('formulas', companyId, id),
    create: (body: Record<string, unknown>) => createDoc<FormulaHeader>('formulas', body),
    act: (id: string, action: MfgAction, companyId: string, remarks?: string) => act('formulas', id, action, companyId, { remarks }),
  },

  orders: {
    list: (companyId: string, params?: Record<string, unknown>) => listDocs<ProductionOrder>('orders', companyId, params),
    get: (companyId: string, id: string) => getDoc<ProductionOrder & { materials: any[]; outputs: any[]; operations: any[]; costs: any[] }>('orders', companyId, id),
    create: (body: Record<string, unknown>) => createDoc<ProductionOrder>('orders', body),
    act: (id: string, action: MfgAction, companyId: string, remarks?: string) => act('orders', id, action, companyId, { remarks }),
    issue: (id: string, companyId: string, body: Record<string, unknown>) => act('orders', id, 'issue', companyId, body),
    receive: (id: string, companyId: string, body: Record<string, unknown>) => act('orders', id, 'receive', companyId, body),
    close: (id: string, companyId: string, remarks?: string) => act('orders', id, 'close', companyId, { remarks }),
  },
};
