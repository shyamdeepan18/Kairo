import { Routes, Route, Navigate } from 'react-router-dom';
import { StockBalancesPage } from './StockBalances';
import { StockLedgerPage } from './StockLedger';
import { StockAdjustmentsPage } from './StockAdjustments';
import { StockTransfersPage } from './StockTransfers';

export function InventoryRoutes() {
  return (
    <Routes>
      <Route index element={<Navigate to="stock" replace />} />
      <Route path="stock"       element={<StockBalancesPage />} />
      <Route path="ledger"      element={<StockLedgerPage />} />
      <Route path="adjustments" element={<StockAdjustmentsPage />} />
      <Route path="transfers"   element={<StockTransfersPage />} />
    </Routes>
  );
}
