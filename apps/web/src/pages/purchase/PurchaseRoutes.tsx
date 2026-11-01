import { Routes, Route, Navigate } from 'react-router-dom';
import { PurchaseOrdersPage } from './PurchaseOrders';
import { RequisitionsPage } from './Requisitions';
import { BlanketPurchaseOrdersPage } from './BlanketPurchaseOrders';
import { GrnPage } from './Grn';
import { LandedCostVouchersPage } from './LandedCostVouchers';
import { PurchaseInvoicesPage } from './Invoices';
import { PurchasePaymentsPage } from './Payments';
import { PurchaseDebitNotesPage } from './DebitNotes';
import { PurchaseReturnsPage } from './PurchaseReturns';

/**
 * Purchase module routes — mounted at /purchase/* in App.tsx.
 * Paths match the sidebar nav defined in AppShell:
 *   /purchase/requisitions · /blanket-orders · /orders · /grn · /landed-cost-vouchers · /invoices · /payments · /returns · /debit-notes
 */
export function PurchaseRoutes() {
  return (
    <Routes>
      <Route index element={<Navigate to="orders" replace />} />
      <Route path="requisitions" element={<RequisitionsPage />} />
      <Route path="blanket-orders" element={<BlanketPurchaseOrdersPage />} />
      <Route path="orders" element={<PurchaseOrdersPage />} />
      <Route path="grn" element={<GrnPage />} />
      <Route path="landed-cost-vouchers" element={<LandedCostVouchersPage />} />
      <Route path="invoices" element={<PurchaseInvoicesPage />} />
      <Route path="payments" element={<PurchasePaymentsPage />} />
      <Route path="returns" element={<PurchaseReturnsPage />} />
      <Route path="debit-notes" element={<PurchaseDebitNotesPage />} />
    </Routes>
  );
}
