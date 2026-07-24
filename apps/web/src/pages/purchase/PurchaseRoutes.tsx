import { Routes, Route, Navigate } from 'react-router-dom';
import { PurchaseOrdersPage } from './PurchaseOrders';
import { RequisitionsPage } from './Requisitions';
import { GrnPage } from './Grn';
import { PurchaseInvoicesPage } from './Invoices';
import { PurchasePaymentsPage } from './Payments';

/**
 * Purchase module routes — mounted at /purchase/* in App.tsx.
 * Paths match the sidebar nav defined in AppShell:
 *   /purchase/requisitions · /orders · /grn · /invoices · /payments
 */
export function PurchaseRoutes() {
  return (
    <Routes>
      <Route index element={<Navigate to="orders" replace />} />
      <Route path="requisitions" element={<RequisitionsPage />} />
      <Route path="orders" element={<PurchaseOrdersPage />} />
      <Route path="grn" element={<GrnPage />} />
      <Route path="invoices" element={<PurchaseInvoicesPage />} />
      <Route path="payments" element={<PurchasePaymentsPage />} />
    </Routes>
  );
}
