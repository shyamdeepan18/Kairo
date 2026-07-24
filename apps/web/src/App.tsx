import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ConfigProvider, App as AntApp } from 'antd';
import { lightTheme, darkTheme } from './theme';
import { useAuthStore } from './store/auth';
import { useThemeStore } from './store/theme';
import { ProtectedRoute, PlantRoute } from './components/ProtectedRoute';
import { AppShell } from './layouts/AppShell';
import { LoginPage } from './pages/Login';
import { SelectCompanyPage } from './pages/SelectCompany';
import { DashboardPage } from './pages/Dashboard';
import { NotFoundPage } from './pages/NotFound';
import { SettingsLayout } from './pages/settings/index';
import { CompanySettingsPage } from './pages/settings/CompanySettings';
import { UsersPage } from './pages/settings/Users';
import { RolesPage } from './pages/settings/Roles';
import { ChartOfAccountsPage } from './pages/settings/ChartOfAccounts';
import { PlantsWarehousesPage } from './pages/settings/PlantsWarehouses';
import { NumberSeriesPage } from './pages/settings/NumberSeries';
import { TaxCodesPage } from './pages/settings/TaxCodes';
import { CustomFieldsPage } from './pages/settings/CustomFields';
import { SuppliersPage, CustomersPage } from './pages/masters/Parties';
import { SupplierDetailPage, CustomerDetailPage } from './pages/masters/PartyDetail';
import { ItemsPage } from './pages/masters/Items';
import { ItemGroupsPage } from './pages/masters/ItemGroups';
import { UomPage } from './pages/masters/Uom';
import { PurchaseRoutes } from './pages/purchase/PurchaseRoutes';
import { SalesRoutes } from './pages/sales/SalesRoutes';
import { InventoryRoutes } from './pages/inventory/InventoryRoutes';
import { ManufacturingRoutes } from './pages/manufacturing/ManufacturingRoutes';
import { AccountingRoutes } from './pages/accounting/AccountingRoutes';
import { ReportRoutes } from './pages/reports/ReportRoutes';
import { PrintDocumentPage } from './pages/print/PrintDocument';
import { AdminPortalPage } from './pages/admin/AdminPortal';

export function App() {
  const initialize = useAuthStore((s) => s.initialize);
  const { isDark } = useThemeStore();

  // Restore session from httpOnly refresh cookie on first mount
  useEffect(() => { initialize(); }, [initialize]);

  // Sync dark mode to <html data-theme="dark"> for CSS variable switching
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  return (
    <ConfigProvider theme={isDark ? darkTheme : lightTheme}>
      <AntApp>
        <BrowserRouter>
          <Routes>
            {/* Public */}
            <Route path="/login" element={<LoginPage />} />

            {/* Authenticated — no plant required */}
            <Route element={<ProtectedRoute />}>
              {/* System Admin Portal — only visible to isSystemAdmin users */}
              <Route path="/admin" element={<AdminPortalPage />} />

              <Route path="/select-company" element={<SelectCompanyPage />} />

              {/* Authenticated + plant selected → AppShell */}
              <Route element={<PlantRoute />}>
                <Route element={<AppShell />}>
                  <Route path="/" element={<Navigate to="/dashboard" replace />} />
                  <Route path="/dashboard" element={<DashboardPage />} />

                  {/* ── Phase 1: Settings ───────────────────────────────── */}
                  <Route path="/settings" element={<SettingsLayout />}>
                    <Route index element={<Navigate to="/settings/company" replace />} />
                    <Route path="company" element={<CompanySettingsPage />} />
                    <Route path="plants" element={<PlantsWarehousesPage />} />
                    <Route path="users" element={<UsersPage />} />
                    <Route path="roles" element={<RolesPage />} />
                    <Route path="number-series" element={<NumberSeriesPage />} />
                    <Route path="coa" element={<ChartOfAccountsPage />} />
                    <Route path="tax-codes" element={<TaxCodesPage />} />
                    <Route path="custom-fields" element={<CustomFieldsPage />} />
                  </Route>

                  {/* ── Phase 2: Masters ────────────────────────────────── */}
                  <Route path="/masters/suppliers" element={<SuppliersPage />} />
                  <Route path="/masters/suppliers/:id" element={<SupplierDetailPage />} />
                  <Route path="/masters/customers" element={<CustomersPage />} />
                  <Route path="/masters/customers/:id" element={<CustomerDetailPage />} />
                  <Route path="/masters/items" element={<ItemsPage />} />
                  <Route path="/masters/item-groups" element={<ItemGroupsPage />} />
                  <Route path="/masters/uom" element={<UomPage />} />

                  {/* ── Phase 3: Purchase ───────────────────────────────── */}
                  <Route path="/purchase/*" element={<PurchaseRoutes />} />

                  {/* ── Phase 4: Sales ──────────────────────────────────── */}
                  <Route path="/sales/*" element={<SalesRoutes />} />

                  {/* ── Phase 5: Inventory ──────────────────────────────── */}
                  <Route path="/inventory/*" element={<InventoryRoutes />} />

                  {/* ── Phase 6: Manufacturing ──────────────────────────── */}
                  <Route path="/manufacturing/*" element={<ManufacturingRoutes />} />

                  {/* ── Phase 7: Accounting ─────────────────────────────── */}
                  <Route path="/accounting/*" element={<AccountingRoutes />} />

                  {/* ── Phase 8: Reports ────────────────────────────────── */}
                  <Route path="/reports/*" element={<ReportRoutes />} />

                  {/* ── Phase 9: Print Engine ─────────────────────────────── */}
                  <Route path="/print/:docType/:id" element={<PrintDocumentPage />} />
                </Route>
              </Route>
            </Route>

            {/* 404 */}
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </BrowserRouter>
      </AntApp>
    </ConfigProvider>
  );
}
