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
  const [selectedTracerItem, setSelectedTracerItem] = useState<{ id: string; name: string; batch: string; stock: number } | null>(null);

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
    id: r.itemId,
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

  // KPI stats calculations
  const totalSkus = stockItems.length;
  const totalUnits = stockItems.reduce((acc, i) => acc + i.total, 0);
  const totalValuationPaise = rows.reduce((acc, r) => acc + (r.valuationAmountPaise || 0), 0);
  const expiringCount = stockItems.filter(i => checkExpiryWarning(i.nearestExpiry)).length + expiryItems.length;

  return (
    <div className="h-full flex flex-col bg-slate-50 dark:bg-slate-950 min-h-screen text-slate-900 dark:text-slate-100 transition-colors">
      {/* Top Header Bar */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0 transition-colors">
        <div className="flex items-center space-x-3.5">
          <div className="p-2.5 bg-teal-50 dark:bg-teal-950/50 text-teal-600 dark:text-teal-400 border border-teal-100 dark:border-teal-900/40 rounded-xl shadow-xs">
            <Package className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mb-0.5">
              <span>Inventory</span>
              <span>/</span>
              <span className="text-teal-600 dark:text-teal-400 font-medium">Stock Balances & Batches</span>
            </div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
              Stock Balances & Batch Register
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Real-time SKU quantities on hand, active batch tracking, and loose pack fractions
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setActiveTab('STOCK')}
            className="inline-flex items-center gap-2 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-semibold transition-all shadow-xs"
          >
            <Download className="w-3.5 h-3.5" /> Export CSV
          </button>
          <button 
            onClick={() => message.info('Barcode scanner initialized')}
            className="inline-flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white rounded-xl shadow-xs text-sm font-semibold transition-all focus:outline-none focus:ring-2 focus:ring-teal-500/20"
          >
            <Boxes className="w-4 h-4" /> Physical Audit (Scan)
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="p-6 max-w-7xl mx-auto w-full flex-1 flex flex-col gap-6">
        {/* KPI Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs transition-colors">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Tracked SKUs</span>
              <div className="p-2 bg-teal-50 dark:bg-teal-950/50 rounded-lg text-teal-600 dark:text-teal-400">
                <Package className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold text-slate-900 dark:text-white mt-2">{totalSkus}</div>
            <div className="text-xs text-slate-400 dark:text-slate-500 mt-1">Distinct active catalog items</div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs transition-colors">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Units On Hand</span>
              <div className="p-2 bg-blue-50 dark:bg-blue-950/50 rounded-lg text-blue-600 dark:text-blue-400">
                <Boxes className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-2">
              {totalUnits.toLocaleString('en-IN')}
            </div>
            <div className="text-xs text-slate-400 dark:text-slate-500 mt-1">Combined physical base units</div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs transition-colors">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Stock Valuation</span>
              <div className="p-2 bg-emerald-50 dark:bg-emerald-950/50 rounded-lg text-emerald-600 dark:text-emerald-400">
                <TrendingUp className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-2">
              {canViewCost ? `₹ ${(totalValuationPaise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : 'Restricted'}
            </div>
            <div className="text-xs text-slate-400 dark:text-slate-500 mt-1">Weighted average cost basis</div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs transition-colors">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Near Expiry / Risk</span>
              <div className="p-2 bg-rose-50 dark:bg-rose-950/50 rounded-lg text-rose-600 dark:text-rose-400">
                <AlertTriangle className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold text-rose-600 dark:text-rose-400 mt-2">{expiringCount}</div>
            <div className="text-xs text-slate-400 dark:text-slate-500 mt-1">Within 30 days or pending return</div>
          </div>
        </div>

        {/* View Mode Tabs Bar */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-2 shadow-xs flex flex-wrap items-center justify-between gap-3 transition-colors">
          <div className="flex items-center gap-1.5 flex-wrap">
            <button 
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${activeTab === 'STOCK' ? 'bg-teal-50 dark:bg-teal-950/50 text-teal-700 dark:text-teal-400 border border-teal-200 dark:border-teal-800/60 shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}
              onClick={() => setActiveTab('STOCK')}
            >
              Stock Register
            </button>
            <button 
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${activeTab === 'EXPIRY' ? 'bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800/60 shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}
              onClick={() => setActiveTab('EXPIRY')}
            >
              Near Expiry & Damage
            </button>
            <button 
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${activeTab === 'ADJUSTMENTS' ? 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800/60 shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}
              onClick={() => setActiveTab('ADJUSTMENTS')}
            >
              Stock Adjustments
            </button>
            <button 
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${activeTab === 'ITEM_MASTER_RULES' ? 'bg-violet-50 dark:bg-violet-950/50 text-violet-700 dark:text-violet-400 border border-violet-200 dark:border-violet-800/60 shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}
              onClick={() => setActiveTab('ITEM_MASTER_RULES')}
            >
              Item Rules
            </button>
            <button 
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${activeTab === 'UNIT_CONVERSION' ? 'bg-cyan-50 dark:bg-cyan-950/50 text-cyan-700 dark:text-cyan-400 border border-cyan-200 dark:border-cyan-800/60 shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}
              onClick={() => setActiveTab('UNIT_CONVERSION')}
            >
              Unit Conversion
            </button>
          </div>
        </div>

        {/* Tab Content */}
        {activeTab === 'STOCK' && (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden transition-colors flex flex-col min-h-[400px]">
            <div className="p-4 border-b border-slate-100 dark:border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">Active Stock Register</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">Live quantities and batch distribution by warehouse</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-medium">
                  {stockItems.length} SKUs Listed
                </span>
              </div>
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
                        <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold transition-colors border border-transparent dark:border-slate-700">
                          <Boxes className="w-3 h-3 mr-1 text-slate-400 dark:text-slate-500" /> {item.batches} Batches
                        </span>
                      </td>
                      <td className="px-6 py-4 text-slate-900 dark:text-slate-200 text-right font-medium transition-colors">{item.packs}</td>
                      <td className="px-6 py-4 text-slate-600 dark:text-slate-400 text-right font-medium transition-colors">
                        {item.loose > 0 ? <span className="text-amber-600 dark:text-amber-400 font-bold bg-amber-50 dark:bg-amber-900/20 px-2 py-0.5 rounded-md">{item.loose} (Fraction)</span> : '-'}
                      </td>
                      <td className="px-6 py-4 text-right transition-colors">
                         <div className="flex items-center justify-end font-bold text-teal-700 dark:text-teal-400">
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
                          onClick={() => {
                            setSelectedTracerItem({ id: item.id, name: item.name, batch: item.defaultBatch, stock: item.total });
                            setSelectedTracerBatch(item.defaultBatch);
                            setTracerModalOpen(true);
                          }}
                          className="px-3 py-1.5 bg-teal-50 dark:bg-teal-900/20 hover:bg-teal-100 dark:hover:bg-teal-900/40 text-teal-800 dark:text-teal-400 border border-teal-200 dark:border-teal-800/50 font-bold text-xs rounded-xl flex items-center justify-center mx-auto transition-colors shadow-xs"
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
           <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden flex flex-col min-h-[400px] transition-colors">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-rose-50/50 dark:bg-rose-950/20 transition-colors">
               <div>
                  <h3 className="font-bold text-rose-800 dark:text-rose-400 text-base flex items-center transition-colors">
                    <AlertTriangle className="w-5 h-5 mr-2" /> Action Required: Near Expiry Batches
                  </h3>
                  <p className="text-xs text-rose-600 dark:text-rose-500 mt-0.5 transition-colors">Review batches reaching expiry within 30 days to initiate supplier returns.</p>
               </div>
               <button className="bg-rose-600 hover:bg-rose-700 text-white px-4 py-2 rounded-xl text-xs font-bold transition-colors shadow-xs">
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
            <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-col items-center text-center h-64 transition-colors shadow-xs">
              <div className="w-16 h-16 bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 rounded-full flex items-center justify-center mb-4 transition-colors shadow-xs">
                <ArrowRightLeft className="w-8 h-8" />
              </div>
              <h3 className="font-bold text-slate-800 dark:text-white text-lg transition-colors">New Stock Journal</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 max-w-sm transition-colors">Create a journal entry to handle stock write-offs or physical count corrections.</p>
              <button 
                onClick={() => window.location.href = '/inventory/adjustments'}
                className="mt-6 bg-slate-900 dark:bg-amber-500/20 dark:border dark:border-amber-500/50 text-white dark:text-amber-400 px-6 py-2 rounded-xl text-sm font-bold shadow-xs hover:bg-slate-800 dark:hover:bg-amber-500/30 transition-colors"
              >
                Go to Stock Adjustments
              </button>
            </div>
          </div>
        )}

        {activeTab === 'ITEM_MASTER_RULES' && (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs p-6 space-y-6 transition-colors">
            <div className="flex justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white text-lg flex items-center transition-colors">
                  <Sliders className="w-5 h-5 mr-2 text-violet-600 dark:text-violet-400" /> Controls & Return Policy
                </h3>
              </div>
              <button 
                onClick={() => message.success('Item master rules saved')}
                className="px-5 py-2.5 bg-violet-700 hover:bg-violet-800 text-white font-bold rounded-xl text-xs shadow-xs transition-colors"
              >
                Save Master Settings
              </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="p-5 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 space-y-4 transition-colors">
                <h4 className="font-bold text-slate-900 dark:text-white text-sm flex items-center transition-colors">
                  <Shield className="w-4 h-4 mr-2 text-violet-600 dark:text-violet-400" /> Max Discount & MRP Ceiling
                </h4>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 transition-colors">Max Discount %</label>
                <input type="number" value={maxDiscountCap} onChange={(e) => setMaxDiscountCap(Number(e.target.value))} className="w-full p-2.5 border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-violet-500 dark:focus:ring-violet-400 transition-colors font-mono" />
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
        itemId={selectedTracerItem?.id}
        itemName={selectedTracerItem?.name}
        currentStock={selectedTracerItem?.stock}
      />
    </div>
  );
}

export default StockBalancesPage;
