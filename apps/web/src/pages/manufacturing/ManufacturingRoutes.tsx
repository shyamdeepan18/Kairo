import { Routes, Route, Navigate } from 'react-router-dom';
import { WorkCentresPage } from './WorkCentres';
import { FormulasPage } from './Formulas';
import { ProductionOrdersPage } from './ProductionOrders';
import { SubcontractingPage } from './Subcontracting';
import { ProcessBatchesPage } from './ProcessBatches';

/**
 * Manufacturing module routes — mounted at /manufacturing/* in App.tsx.
 * Supported aliases for sidebar nav and bookmarks:
 *   /manufacturing/bom · /formulas · /work-centres · /work-centers · /orders · /batches · /subcontracting
 */
export function ManufacturingRoutes() {
  return (
    <Routes>
      <Route index element={<Navigate to="orders" replace />} />
      <Route path="bom" element={<FormulasPage />} />
      <Route path="formulas" element={<FormulasPage />} />
      <Route path="work-centres" element={<WorkCentresPage />} />
      <Route path="work-centers" element={<WorkCentresPage />} />
      <Route path="batches" element={<ProcessBatchesPage />} />
      <Route path="orders" element={<ProductionOrdersPage />} />
      <Route path="subcontracting" element={<SubcontractingPage />} />
    </Routes>
  );
}

export default ManufacturingRoutes;
