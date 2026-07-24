import { Routes, Route, Navigate } from 'react-router-dom';
import { PlaceholderPage } from '../_shared/PlaceholderPage';
import { StockLedgerReport } from './StockLedgerReport';
import { GeneralLedgerReport } from './GeneralLedgerReport';
import SalesReport from './SalesReport';
import PurchaseReport from './PurchaseReport';

export function ReportRoutes() {
  return (
    <Routes>
      <Route index element={<Navigate to="sales" replace />} />
      <Route path="dashboard" element={<Navigate to="sales" replace />} />
      
      {/* Real Reports */}
      <Route path="inventory" element={<StockLedgerReport />} />
      <Route path="finance" element={<GeneralLedgerReport />} />
      <Route path="sales" element={<SalesReport />} />
      <Route path="purchase" element={<PurchaseReport />} />
      
      <Route path="*" element={<PlaceholderPage title="Custom Report" moduleName="Reports" />} />
    </Routes>
  );
}
