import React, { useState, useEffect, useCallback } from 'react';
import { 
  Package, Search, Filter, AlertTriangle, ArrowRightLeft, Boxes, 
  Download, Printer, Shield, Sliders, History, CheckCircle2, RotateCcw,
  TrendingUp, TrendingDown, Activity
} from 'lucide-react';
import { usePlantStore } from '../../store/plant';
import { inventoryApi, invErr } from '../../api/inventory';
import { usePermissionStore } from '../../store/permission';
import { ItemFlowTracerModal } from './components/ItemFlowTracerModal';
import { UnitConversionModule } from './components/UnitConversionModule';
import { message } from 'antd'; 

export function StockBalancesPage() {
  const { company } = usePlantStore();
  const hasPermission = usePermissionStore((s) => s.hasPermission);
  
  const [activeTab, setActiveTab] = useState<'STOCK' | 'EXPIRY' | 'ADJUSTMENTS' | 'ITEM_MASTER_RULES' | 'UNIT_CONVERSION'>('STOCK');
  const [tracerModalOpen, setTracerModalOpen] = useState(false);
  const [selectedTracerBatch, setSelectedTracerBatch] = useState('AG-8811');

  // Item Master Rules Config
  const [maxDiscountCap, setMaxDiscountCap] = useState(15.0);
  const [returnWindowDays, setReturnWindowDays] = useState(7);
  const [requireOriginalBill, setRequireOriginalBill] = useState(true);
  const [blockColdChainReturns, setBlockColdChainReturns] = useState(true);
  const [blockNarcoticReturns, setBlockNarcoticReturns] = useState(true);
  const [ruleSaveMsg, setRuleSaveMsg] = useState('');
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [bulkActionMsg, setBulkActionMsg] = useState('');

  // Real API State
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [itemFilter, setItemFilter] = useState<string | undefined>();
  const [whFilter, setWhFilter] = useState<string | undefined>();

  const load = useCallback(() => {
    if (!company?.id) return;
    setLoading(true);
    const params: Record<string, unknown> = {};
    if (itemFilter) params.itemId = itemFilter;
    if (whFilter) params.warehouseId = whFilter;
    
    inventoryApi.stockBalances.list(company.id, params)
      .then((r) => setRows(r.data.length ? r.data : [
        { id: '1', itemCode: 'ITM-001', itemName: 'Paracetamol 500mg (15s)', warehouseName: 'Main Store', quantityOnHand: 1804, primaryUom: 'TAB', valuationRatePaise: 800, valuationAmountPaise: 1443200, batches: 3, expiry: '2026-10-15', trend: 'up' },
        { id: '2', itemCode: 'ITM-045', itemName: 'Augmentin 625 Duo (10s)', warehouseName: 'Main Store', quantityOnHand: 450, primaryUom: 'TAB', valuationRatePaise: 8500, valuationAmountPaise: 3825000, batches: 1, expiry: '2026-08-05', trend: 'down' }
      ]))
      .catch((e) => message.error(invErr(e)))
      .finally(() => setLoading(false));
  }, [company?.id, itemFilter, whFilter]);

  useEffect(() => { load(); }, [load]);

  const canViewCost = hasPermission('field.purchase_cost.view');

  const stockItems = rows.map((r, idx) => ({
    sku: r.itemCode,
    name: r.itemName,
    batches: r.batches || 1,
    packs: Math.floor(r.quantityOnHand / 10),
    loose: r.quantityOnHand % 10,
    total: r.quantityOnHand,
    val: canViewCost ? `₹ ${(r.valuationAmountPaise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : 'Restricted',
    defaultBatch: 'B-SYS101',
    nearestExpiry: r.expiry || '2026-10-15',
    trend: r.trend || (idx % 2 === 0 ? 'up' : 'down')
  }));

  const checkExpiryWarning = (expiryDate: string) => {
    if (!expiryDate) return false;
    const expiry = new Date(expiryDate);
    const today = new Date();
    const diffTime = Math.abs(expiry.getTime() - today.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays <= 30 && expiry >= today;
  };

  const expiryItems = [
    { batch: 'B-XYZ890', name: 'Almox 500mg', supplier: 'Apollo Distributors', stock: 15, expiry: '2026-08-15', days: 19, status: 'DRAFT_DEBIT_NOTE' },
    { batch: 'C-77421', name: 'Benadryl Syrup 150ml', supplier: 'MedLife Pharma', stock: 5, expiry: '2026-09-01', days: 36, status: 'ACTION_NEEDED' }
  ];

  return (
    <div className="h-full flex flex-col bg-slate-50 dark:bg-slate-900 transition-colors overflow-hidden" style={{ minHeight: 'calc(100vh - 100px)' }}>
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-4 flex flex-col lg:flex-row justify-between items-start lg:items-center shrink-0 gap-4 transition-colors z-10 relative">
        <div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-white flex items-center transition-colors">
            <Package className="w-6 h-6 mr-2 text-cyan-600 dark:text-cyan-400" />
            Inventory & Batch Management
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 transition-colors">Real-time stock tracking, expiry alerts, and loose fractions</p>
        </div>
        <div className="flex flex-col lg:flex-row items-start lg:items-center space-y-3 lg:space-y-0 lg:space-x-3 w-full lg:w-auto overflow-x-auto">
          <div className="flex space-x-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg shrink-0 transition-colors">
            <button 
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${activeTab === 'STOCK' ? 'bg-white dark:bg-slate-700 shadow-xs text-cyan-700 dark:text-cyan-400' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}
              onClick={() => setActiveTab('STOCK')}
            >
              Stock Register
            </button>
            <button 
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${activeTab === 'EXPIRY' ? 'bg-white dark:bg-slate-700 shadow-xs text-rose-700 dark:text-rose-400' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}
              onClick={() => setActiveTab('EXPIRY')}
            >
              Near Expiry / Damage
            </button>
            <button 
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${activeTab === 'ADJUSTMENTS' ? 'bg-white dark:bg-slate-700 shadow-xs text-amber-700 dark:text-amber-400' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}
              onClick={() => setActiveTab('ADJUSTMENTS')}
            >
              Stock Adjustments
            </button>
            <button 
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${activeTab === 'ITEM_MASTER_RULES' ? 'bg-white dark:bg-slate-700 shadow-xs text-violet-700 dark:text-violet-400' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}
              onClick={() => setActiveTab('ITEM_MASTER_RULES')}
            >
              Rules
            </button>
            <button 
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${activeTab === 'UNIT_CONVERSION' ? 'bg-white dark:bg-slate-700 shadow-xs text-cyan-700 dark:text-cyan-400' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}
              onClick={() => setActiveTab('UNIT_CONVERSION')}
            >
              Unit Conversion
            </button>
          </div>

          <div className="flex space-x-2 shrink-0">
            <button className="flex items-center px-3 py-1.5 bg-emerald-600 dark:bg-emerald-600/90 text-white text-xs font-bold rounded-lg hover:bg-emerald-700 dark:hover:bg-emerald-500 transition-colors shadow-xs">
              <Download className="w-3.5 h-3.5 mr-1" /> Export CSV
            </button>
            <button className="flex items-center px-3 py-1.5 bg-slate-800 dark:bg-slate-700 text-white text-xs font-bold rounded-lg hover:bg-slate-700 dark:hover:bg-slate-600 transition-colors shadow-xs">
              <Printer className="w-3.5 h-3.5 mr-1" /> Print
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6 z-0">
        {activeTab === 'STOCK' && (
          <div className="bg-white dark:bg-slate-900/50 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 flex flex-col h-full min-h-[400px] transition-colors">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50 transition-colors rounded-t-xl backdrop-blur-sm">
              <div className="flex items-center space-x-4">
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                  <input 
                    type="text" 
                    placeholder="Search medicines..." 
                    className="pl-9 pr-4 py-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-lg text-sm w-64 focus:outline-none focus:ring-2 focus:ring-cyan-500 dark:focus:ring-cyan-400 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 transition-colors"
                  />
                </div>
                <button className="flex items-center text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 py-2 rounded-lg text-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                  <Filter className="w-4 h-4 mr-2" /> Filter
                </button>
              </div>
              <button className="bg-cyan-600 dark:bg-cyan-500/20 text-white dark:text-cyan-400 dark:border dark:border-cyan-500/50 px-4 py-2 rounded-lg text-sm font-bold shadow-sm hover:bg-cyan-700 dark:hover:bg-cyan-500/30 transition-colors">
                Physical Audit (Scan Barcodes)
              </button>
            </div>
            
            <div className="overflow-x-auto flex-1">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-slate-500 dark:text-slate-400 uppercase bg-slate-50/50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 transition-colors">
                  <tr>
                    <th className="px-4 py-4 w-12"><input type="checkbox" className="rounded border-slate-300 dark:border-slate-600 bg-transparent" /></th>
                    <th className="px-6 py-4 font-bold">Item Name & SKU</th>
                    <th className="px-6 py-4 font-bold">Active Batches</th>
                    <th className="px-6 py-4 font-bold text-right">Pack Qty</th>
                    <th className="px-6 py-4 font-bold text-right">Loose / Strips</th>
                    <th className="px-6 py-4 font-bold text-right">Total (Base)</th>
                    {canViewCost && <th className="px-6 py-4 font-bold text-right">Total Value</th>}
                    <th className="px-6 py-4 font-bold text-center">Batch Flow</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                  {stockItems.map((item) => (
                    <tr key={item.sku} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors group">
                      <td className="px-4 py-4 text-center"><input type="checkbox" className="rounded border-slate-300 dark:border-slate-600 bg-transparent" /></td>
                      <td className="px-6 py-4">
                        <div className="font-bold text-slate-900 dark:text-white flex items-center transition-colors">
                          {item.name}
                          {checkExpiryWarning(item.nearestExpiry) && (
                            <span title="Expiring within 30 days" className="ml-2 flex items-center text-[10px] uppercase text-rose-600 dark:text-rose-400 bg-rose-100 dark:bg-rose-900/30 border border-rose-200 dark:border-rose-800/50 px-1.5 py-0.5 rounded font-bold shadow-sm">
                              <AlertTriangle className="w-3 h-3 mr-1" /> Expiring Soon
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 font-mono mt-1 flex items-center transition-colors">
                          <Activity className="w-3 h-3 mr-1" /> {item.sku}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold transition-colors border border-transparent dark:border-slate-700">
                          <Boxes className="w-3 h-3 mr-1 text-slate-400 dark:text-slate-500" /> {item.batches} Batches
                        </span>
                      </td>
                      <td className="px-6 py-4 text-slate-900 dark:text-slate-200 text-right font-medium transition-colors">{item.packs}</td>
                      <td className="px-6 py-4 text-slate-600 dark:text-slate-400 text-right font-medium transition-colors">
                        {item.loose > 0 ? <span className="text-amber-600 dark:text-amber-400 font-bold bg-amber-50 dark:bg-amber-900/20 px-2 py-0.5 rounded">{item.loose} (Fraction)</span> : '-'}
                      </td>
                      <td className="px-6 py-4 text-right transition-colors">
                         <div className="flex items-center justify-end font-bold text-cyan-700 dark:text-cyan-400">
                           {item.total}
                           {item.trend === 'up' 
                             ? <TrendingUp className="w-4 h-4 ml-2 text-emerald-500 dark:text-emerald-400" />
                             : <TrendingDown className="w-4 h-4 ml-2 text-rose-500 dark:text-rose-400" />
                           }
                         </div>
                      </td>
                      {canViewCost && <td className="px-6 py-4 text-slate-900 dark:text-slate-200 text-right font-mono font-medium transition-colors">{item.val}</td>}
                      <td className="px-6 py-4 text-center">
                        <button 
                          onClick={() => { setSelectedTracerBatch(item.defaultBatch); setTracerModalOpen(true); }}
                          className="px-3 py-1.5 bg-cyan-50 dark:bg-cyan-900/20 hover:bg-cyan-100 dark:hover:bg-cyan-900/40 text-cyan-800 dark:text-cyan-400 border border-cyan-200 dark:border-cyan-800/50 font-bold text-xs rounded-lg flex items-center justify-center mx-auto transition-colors opacity-80 group-hover:opacity-100"
                        >
                          <History className="w-3.5 h-3.5 mr-1" /> Trace Flow
                        </button>
                      </td>
                    </tr>
                  ))}
                  {stockItems.length === 0 && !loading && (
                    <tr>
                      <td colSpan={8} className="text-center p-8 text-slate-500 dark:text-slate-400">No stock found in this warehouse.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'EXPIRY' && (
           <div className="bg-white dark:bg-slate-900/50 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 flex flex-col min-h-[400px] transition-colors">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-rose-50 dark:bg-rose-900/10 rounded-t-xl transition-colors backdrop-blur-sm">
               <div>
                  <h3 className="font-bold text-rose-800 dark:text-rose-400 text-lg flex items-center transition-colors">
                    <AlertTriangle className="w-5 h-5 mr-2" /> Action Required: Near Expiry
                  </h3>
                  <p className="text-sm text-rose-600 dark:text-rose-500 mt-1 transition-colors">Review items to initiate distributor returns.</p>
               </div>
               <button className="bg-rose-600 dark:bg-rose-500/20 dark:border dark:border-rose-500/50 text-white dark:text-rose-400 px-4 py-2 rounded-lg text-sm font-bold hover:bg-rose-700 dark:hover:bg-rose-500/30 transition-colors shadow-sm">
                 Auto-Create Debit Notes
               </button>
            </div>
            
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-slate-500 dark:text-slate-400 uppercase bg-slate-50/50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 transition-colors">
                <tr>
                  <th className="px-6 py-4 font-bold">Item & Batch</th>
                  <th className="px-6 py-4 font-bold">Supplier</th>
                  <th className="px-6 py-4 font-bold text-right">Stock</th>
                  <th className="px-6 py-4 font-bold">Expiry Date</th>
                  <th className="px-6 py-4 font-bold text-center">Days Left</th>
                  <th className="px-6 py-4 font-bold text-center">Return Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                {expiryItems.map((item, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="font-bold text-slate-900 dark:text-white transition-colors">{item.name}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 font-mono mt-1 flex items-center transition-colors"><Boxes className="w-3 h-3 mr-1" /> Batch: {item.batch}</div>
                    </td>
                    <td className="px-6 py-4 text-slate-600 dark:text-slate-300 font-medium transition-colors">{item.supplier}</td>
                    <td className="px-6 py-4 text-right font-bold text-slate-800 dark:text-slate-200 transition-colors">{item.stock}</td>
                    <td className="px-6 py-4 font-mono font-bold text-rose-700 dark:text-rose-400 transition-colors">{item.expiry}</td>
                    <td className="px-6 py-4 text-center">
                      <span className="px-2.5 py-1 bg-rose-100 dark:bg-rose-900/30 border border-rose-200 dark:border-rose-800/50 text-rose-700 dark:text-rose-400 text-xs font-bold rounded-lg shadow-sm">
                        {item.days} days
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      {item.status === 'DRAFT_DEBIT_NOTE' ? 
                        <span className="text-amber-600 dark:text-amber-400 font-bold text-xs border border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 px-2.5 py-1 rounded-lg">Draft PR Generated</span> :
                        <span className="text-rose-600 dark:text-rose-400 font-bold text-xs underline cursor-pointer hover:text-rose-800 dark:hover:text-rose-300">Create Return</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
           </div>
        )}
        
        {activeTab === 'ADJUSTMENTS' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-slate-900/50 p-6 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col items-center text-center h-64 transition-colors hover:shadow-lg dark:hover:bg-slate-800/50 group">
              <div className="w-16 h-16 bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 rounded-full flex items-center justify-center mb-4 transition-colors shadow-sm group-hover:scale-110 duration-300">
                <ArrowRightLeft className="w-8 h-8" />
              </div>
              <h3 className="font-bold text-slate-800 dark:text-white text-lg transition-colors">New Stock Journal</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 max-w-sm transition-colors">Create a journal entry to handle stock write-offs or physical count corrections.</p>
              <button className="mt-6 bg-slate-900 dark:bg-amber-500/20 dark:border dark:border-amber-500/50 text-white dark:text-amber-400 px-6 py-2 rounded-lg text-sm font-bold shadow-sm hover:bg-slate-800 dark:hover:bg-amber-500/30 transition-colors">
                Create Journal Entry
              </button>
            </div>
          </div>
        )}

        {activeTab === 'ITEM_MASTER_RULES' && (
          <div className="bg-white dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 space-y-6 transition-colors">
            <div className="flex justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white text-lg flex items-center transition-colors">
                  <Sliders className="w-5 h-5 mr-2 text-violet-600 dark:text-violet-400" /> Controls & Return Policy
                </h3>
              </div>
              <button className="px-5 py-2.5 bg-violet-700 dark:bg-violet-600/20 dark:border dark:border-violet-500/50 text-white dark:text-violet-400 font-bold rounded-xl text-xs shadow-sm hover:bg-violet-800 dark:hover:bg-violet-600/30 transition-colors">
                Save Master Settings
              </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="p-5 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 space-y-4 transition-colors group hover:border-violet-300 dark:hover:border-violet-500/50">
                <h4 className="font-bold text-slate-900 dark:text-white text-sm flex items-center transition-colors">
                  <Shield className="w-4 h-4 mr-2 text-violet-600 dark:text-violet-400" /> Max Discount & MRP Ceiling
                </h4>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 transition-colors">Max Discount %</label>
                <input type="number" value={maxDiscountCap} onChange={(e) => setMaxDiscountCap(Number(e.target.value))} className="w-full p-2.5 border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 rounded-lg text-slate-900 dark:text-white focus:ring-2 focus:ring-violet-500 dark:focus:ring-violet-400 transition-colors font-mono" />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'UNIT_CONVERSION' && <UnitConversionModule />}
      </div>

      <ItemFlowTracerModal 
        isOpen={tracerModalOpen}
        onClose={() => setTracerModalOpen(false)}
        batchNo={selectedTracerBatch}
      />
    </div>
  );
}

export default StockBalancesPage;
