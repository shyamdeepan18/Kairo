import { Routes, Route, Navigate } from 'react-router-dom';
import ProfitLossReport from './ProfitLossReport';
import BalanceSheetReport from './BalanceSheetReport';
import AgingReport from './AgingReport';
import JournalVouchersPage from './JournalVouchers';
import TrialBalanceReportPage from './TrialBalanceReport';
import GstReportsPage from './GstReports';
import { GeneralLedgerReport } from '../reports/GeneralLedgerReport';
import BankReconciliationPage from './BankReconciliation';
import { ProjectAccountingPage } from './ProjectAccounting';

export function AccountingRoutes() {
  return (
    <Routes>
      <Route index element={<Navigate to="profit-loss" replace />} />
      <Route path="jv" element={<JournalVouchersPage />} />
      <Route path="journal" element={<JournalVouchersPage />} />
      <Route path="projects" element={<ProjectAccountingPage />} />
      <Route path="bank-reconciliation" element={<BankReconciliationPage />} />
      <Route path="trial-balance" element={<TrialBalanceReportPage />} />
      <Route path="profit-loss" element={<ProfitLossReport />} />
      <Route path="balance-sheet" element={<BalanceSheetReport />} />
      <Route path="ledger" element={<GeneralLedgerReport />} />
      <Route path="ap-aging" element={<AgingReport />} />
      <Route path="ar-aging" element={<AgingReport />} />
      <Route path="gst" element={<GstReportsPage />} />
      <Route path="gst-reports" element={<GstReportsPage />} />
    </Routes>
  );
}
