import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  History, 
  X, 
  Truck, 
  ShoppingCart, 
  AlertTriangle,
  RotateCcw,
  Loader2
} from 'lucide-react';
import { api } from '../../../api/client';

export interface BatchFlowStep {
  date: string;
  type: 'PURCHASE_INWARD' | 'RETAIL_SALE' | 'CUSTOMER_RETURN' | 'STOCK_ADJUSTMENT';
  referenceNo: string;
  entityName: string; // Vendor name or Patient name
  qtyChange: number; // + or -
  balanceQty: number;
  rateUnit: number;
  notes?: string;
}

const mockBatchFlowData: Record<string, { sku: string; itemName: string; batchNo: string; expDate: string; rackNo: string; initialQty: number; currentQty: number; steps: BatchFlowStep[] }> = {
  'AG-8811': {
    sku: 'ITM-101',
    itemName: 'Augmentin 625 Duo Tablet',
    batchNo: 'AG-8811',
    expDate: '05/2027',
    rackNo: 'Rack A-04 (Antibiotics)',
    initialQty: 100,
    currentQty: 45,
    steps: [
      { date: '2026-07-01', type: 'PURCHASE_INWARD', referenceNo: 'PUR-99120', entityName: 'Apex Distributors Ltd', qtyChange: 100, balanceQty: 100, rateUnit: 162.00, notes: 'PO # 4410 - Received in good condition' },
      { date: '2026-07-05', type: 'RETAIL_SALE', referenceNo: 'POS-88102', entityName: 'Ramesh Kumar (Patient)', qtyChange: -10, balanceQty: 90, rateUnit: 191.60 },
      { date: '2026-07-12', type: 'RETAIL_SALE', referenceNo: 'POS-88240', entityName: 'Anita Gupta (Patient)', qtyChange: -20, balanceQty: 70, rateUnit: 191.60 },
      { date: '2026-07-18', type: 'STOCK_ADJUSTMENT', referenceNo: 'ADJ-104', entityName: 'Priya K. (Pharmacist)', qtyChange: -5, balanceQty: 65, rateUnit: 162.00, notes: 'Damage during shelf restocking' },
      { date: '2026-07-25', type: 'RETAIL_SALE', referenceNo: 'POS-88910', entityName: 'Suresh Verma (Patient)', qtyChange: -20, balanceQty: 45, rateUnit: 191.60 },
    ]
  }
};

interface ItemFlowTracerModalProps {
  isOpen: boolean;
  onClose: () => void;
  batchNo?: string;
  itemId?: string;
  itemName?: string;
  currentStock?: number | string;
}

export const ItemFlowTracerModal: React.FC<ItemFlowTracerModalProps> = ({
  isOpen,
  onClose,
  batchNo = 'AG-8811',
  itemId,
  itemName,
  currentStock,
}) => {
  const [selectedBatch] = useState(batchNo);
  const [loading, setLoading] = useState(false);
  const [realSteps, setRealSteps] = useState<BatchFlowStep[] | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    if (!itemId) {
      setRealSteps(null);
      return;
    }
    setLoading(true);
    api.get('/inventory/stock-ledger', { params: { itemId, pageSize: 50 } })
      .then((res) => {
        const rows = res.data?.data || res.data;
        if (Array.isArray(rows) && rows.length > 0) {
          const sorted = [...rows].sort((a, b) => new Date(a.postingDate).getTime() - new Date(b.postingDate).getTime());
          let runningBalance = 0;
          const mapped: BatchFlowStep[] = sorted.map((entry: any) => {
            const qty = Number(entry.quantity) || 0;
            runningBalance += qty;
            const mType = String(entry.movementType || '').toLowerCase();
            const dType = String(entry.documentType || '').toLowerCase();
            let stepType: BatchFlowStep['type'] = 'STOCK_ADJUSTMENT';
            if (mType.includes('receive') || mType.includes('inward') || dType.includes('grn')) {
              stepType = 'PURCHASE_INWARD';
            } else if (mType.includes('delivery') || mType.includes('ship') || dType.includes('delivery') || dType.includes('sales')) {
              stepType = 'RETAIL_SALE';
            } else if (mType.includes('return')) {
              stepType = 'CUSTOMER_RETURN';
            }
            return {
              date: String(entry.postingDate || '').slice(0, 10),
              type: stepType,
              referenceNo: entry.documentNumber || entry.documentType || 'LEDGER',
              entityName: entry.warehouseName ? `Location: ${entry.warehouseName}` : (entry.documentType || 'Inventory Movement'),
              qtyChange: qty,
              balanceQty: Math.round(runningBalance * 100) / 100,
              rateUnit: (entry.valuationRatePaise || 0) / 100,
              notes: entry.isReversal ? 'System Reversal Entry' : undefined,
            };
          });
          setRealSteps(mapped.reverse());
        } else {
          setRealSteps(null);
        }
      })
      .catch(() => {
        setRealSteps(null);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [isOpen, itemId]);

  if (!isOpen) return null;

  const fallbackData = mockBatchFlowData[selectedBatch] || mockBatchFlowData['AG-8811'];
  const stepsToDisplay = realSteps ?? fallbackData.steps;
  const displayName = itemName || fallbackData.itemName;
  const displayStock = currentStock !== undefined ? currentStock : fallbackData.currentQty;

  return createPortal(
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-2xs z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-4xl w-full overflow-hidden flex flex-col max-h-[85vh]">
        {/* Modal Header */}
        <div className="bg-slate-900 text-white p-5 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 bg-cyan-600 rounded-xl flex items-center justify-center text-white">
              <History className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base">Item Flow & Stock Ledger Tracer</h3>
              <p className="text-xs text-slate-400">Track complete batch inwarding, stock adjustments, and movement history</p>
            </div>
          </div>

          <button 
            onClick={onClose}
            className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Batch Info Card */}
        <div className="p-6 bg-slate-50 border-b border-slate-200 shrink-0 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs font-mono">
            <div className="bg-white p-3 rounded-xl border border-slate-200">
              <span className="text-slate-400 text-[10px] uppercase block font-bold">Item Description</span>
              <strong className="text-slate-900 font-sans text-sm truncate block">{displayName}</strong>
            </div>

            <div className="bg-white p-3 rounded-xl border border-slate-200">
              <span className="text-slate-400 text-[10px] uppercase block font-bold">Batch Reference</span>
              <strong className="text-cyan-700">{batchNo || 'STANDARD'}</strong>
            </div>

            <div className="bg-white p-3 rounded-xl border border-slate-200">
              <span className="text-slate-400 text-[10px] uppercase block font-bold">Ledger Source</span>
              <strong className="text-slate-800 font-sans">{realSteps ? 'Live DB Ledger' : 'Standard Baseline'}</strong>
            </div>

            <div className="bg-emerald-50 p-3 rounded-xl border border-emerald-200 text-emerald-900">
              <span className="text-emerald-700 text-[10px] uppercase block font-bold">Current Stock Balance</span>
              <strong className="text-emerald-950 text-base">{displayStock} Units Remaining</strong>
            </div>
          </div>
        </div>

        {/* Timeline Flow */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          <div className="flex justify-between items-center">
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
              Movement Audit Timeline ({stepsToDisplay.length} Entries)
            </span>
            {loading && (
              <span className="text-xs text-cyan-600 flex items-center gap-1 font-medium">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Fetching live movements...
              </span>
            )}
          </div>

          <div className="relative border-l-2 border-slate-200 ml-4 space-y-6">
            {stepsToDisplay.map((step, idx) => (
              <div key={idx} className="relative pl-6">
                {/* Node Icon */}
                <div className={`absolute -left-[17px] top-0.5 w-8 h-8 rounded-full border-2 flex items-center justify-center text-white ${
                  step.type === 'PURCHASE_INWARD' ? 'bg-emerald-600 border-emerald-200' :
                  step.type === 'RETAIL_SALE' ? 'bg-blue-600 border-blue-200' :
                  step.type === 'CUSTOMER_RETURN' ? 'bg-purple-600 border-purple-200' :
                  'bg-amber-600 border-amber-200'
                }`}>
                  {step.type === 'PURCHASE_INWARD' ? <Truck className="w-4 h-4" /> :
                   step.type === 'RETAIL_SALE' ? <ShoppingCart className="w-4 h-4" /> :
                   step.type === 'CUSTOMER_RETURN' ? <RotateCcw className="w-4 h-4" /> :
                   <AlertTriangle className="w-4 h-4" />}
                </div>

                {/* Content Box */}
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-1 text-xs">
                  <div className="flex items-center justify-between">
                    <span className={`px-2 py-0.5 text-[10px] font-bold rounded ${
                      step.type === 'PURCHASE_INWARD' ? 'bg-emerald-100 text-emerald-800' :
                      step.type === 'RETAIL_SALE' ? 'bg-blue-100 text-blue-800' :
                      step.type === 'CUSTOMER_RETURN' ? 'bg-purple-100 text-purple-800' :
                      'bg-amber-100 text-amber-800'
                    }`}>
                      {step.type.replace('_', ' ')}
                    </span>
                    <span className="text-[11px] font-mono text-slate-400">{step.date}</span>
                  </div>

                  <div className="font-bold text-slate-900 text-sm">{step.entityName}</div>
                  <div className="text-[11px] font-mono text-slate-500">
                    Ref: <strong>{step.referenceNo}</strong>
                    {step.rateUnit > 0 && <> | Valuation Rate: <strong>₹{step.rateUnit.toFixed(2)}</strong></>}
                  </div>

                  {step.notes && (
                    <div className="text-[11px] text-amber-800 bg-amber-50 p-2 rounded-lg border border-amber-200 mt-2 font-sans">
                      Note: {step.notes}
                    </div>
                  )}

                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between font-mono font-bold text-slate-700 text-[11px]">
                    <span>Movement: <strong className={step.qtyChange > 0 ? 'text-emerald-700' : 'text-rose-700'}>{step.qtyChange > 0 ? `+${step.qtyChange}` : step.qtyChange} Units</strong></span>
                    <span>Resulting Stock Balance: <strong className="text-slate-900">{step.balanceQty} Units</strong></span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
