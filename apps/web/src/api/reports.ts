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

export interface SalesProfitabilityRecord {
  item_id: string;
  item_code: string;
  item_name: string;
  customer_name: string;
  total_delivered_qty: string | number;
  total_revenue_paise: number;
  total_cogs_paise: number;
  gross_profit_paise: number;
  gross_margin_percent: string | number;
}

export const reportsApi = {
  getStockLedger(filters: ReportFilters): Promise<StockLedgerEntry[]> {
    return api.get('/reports/stock-ledger', { params: filters }).then(res => res.data);
  },
  getGeneralLedger(filters: ReportFilters): Promise<GeneralLedgerEntry[]> {
    return api.get('/reports/general-ledger', { params: filters }).then(res => res.data);
  },
  getSalesProfitability(): Promise<SalesProfitabilityRecord[]> {
    return api.get('/reports/sales-profitability').then(res => res.data);
  }
};
