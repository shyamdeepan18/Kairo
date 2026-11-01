import { Routes, Route, Navigate } from 'react-router-dom';
import { QuotationsPage } from './Quotations';
import { SalesOrdersPage } from './SalesOrders';
import { DeliveriesPage } from './Deliveries';
import { SalesInvoicesPage } from './SalesInvoices';
import { SalesReceiptsPage } from './Receipts';
import { SalesReturnsPage } from './SalesReturns';
import { CreditNotesPage } from './CreditNotes';
import { QuickInvoicePage } from './QuickInvoice';

/**
 * Sales module routes — mounted at /sales/* in App.tsx.
 * Paths match the sidebar nav defined in AppShell:
 *   /sales/quick-invoice · /quotations · /orders · /delivery · /invoices · /receipts · /returns · /credit-notes
 */
export function SalesRoutes() {
  return (
    <Routes>
      <Route index element={<Navigate to="orders" replace />} />
      <Route path="quick-invoice" element={<QuickInvoicePage />} />
      <Route path="quotations" element={<QuotationsPage />} />
      <Route path="orders" element={<SalesOrdersPage />} />
      <Route path="delivery" element={<DeliveriesPage />} />
      <Route path="invoices" element={<SalesInvoicesPage />} />
      <Route path="receipts" element={<SalesReceiptsPage />} />
      <Route path="returns" element={<SalesReturnsPage />} />
      <Route path="credit-notes" element={<CreditNotesPage />} />
    </Routes>
  );
}
