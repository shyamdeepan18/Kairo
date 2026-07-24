import { api } from './client';

export interface StockLedgerEntry {
  id: string;
  postingDate: string;
  documentType: string;
  documentNumber: string;
  movementType: string;
  quantity: string;
  quantityInPrimaryUom: string;
  valuationRatePaise: number;
  valuationAmountPaise: number;
  isReversal: boolean;
  itemCode: string;
  itemName: string;
  warehouseName: string;
}

export interface GeneralLedgerEntry {
  id: string;
  postingDate: string;
  entryNumber: string;
  documentType: string;
  documentNumber: string;
  narration: string | null;
  lineNarration: string | null;
  debitAmountPaise: number;
  creditAmountPaise: number;
  accountCode: string;
  accountName: string;
}

export interface ReportFilters {
  itemId?: string;
  warehouseId?: string;
  accountId?: string;
  startDate?: string;
  endDate?: string;
}

export const reportsApi = {
  getStockLedger(filters: ReportFilters): Promise<StockLedgerEntry[]> {
    return api.get('/reports/stock-ledger', { params: filters }).then(res => res.data);
  },
  getGeneralLedger(filters: ReportFilters): Promise<GeneralLedgerEntry[]> {
    return api.get('/reports/general-ledger', { params: filters }).then(res => res.data);
  }
};
