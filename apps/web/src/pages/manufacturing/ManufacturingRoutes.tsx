import { Routes, Route, Navigate } from 'react-router-dom';
import { WorkCentresPage } from './WorkCentres';
import { FormulasPage } from './Formulas';
import { ProductionOrdersPage } from './ProductionOrders';

/**
 * Manufacturing module routes — mounted at /manufacturing/* in App.tsx.
 * Paths match the sidebar nav defined in AppShell:
 *   /manufacturing/work-centers · /formulas · /orders
 */
export function ManufacturingRoutes() {
  return (
    <Routes>
      <Route index element={<Navigate to="orders" replace />} />
      <Route path="work-centers" element={<WorkCentresPage />} />
      <Route path="formulas" element={<FormulasPage />} />
      <Route path="orders" element={<ProductionOrdersPage />} />
    </Routes>
  );
}
