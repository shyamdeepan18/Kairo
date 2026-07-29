import React, { useState } from 'react';
import { 
  Boxes, 
  ArrowRightLeft, 
  Layers, 
  Pill, 
  CheckCircle2, 
  AlertTriangle, 
  RefreshCw, 
  Search, 
  Sliders, 
  FileText, 
  ArrowRight,
  Shield,
  Clock,
  User
} from 'lucide-react';

export interface UnitConversionItem {
  sku: string;
  itemName: string;
  batchNo: string;
  stripsPerBox: number;    // e.g. 10 Strips in 1 Box
  tabletsPerStrip: number;  // e.g. 15 Tablets in 1 Strip
  boxesQty: number;         // Current full outer boxes
  stripsQty: number;        // Current full strips
  looseQty: number;         // Current loose tablets
}

export interface ConversionAuditLog {
  id: string;
  date: string;
  itemName: string;
  batchNo: string;
  actionType: 'BREAK_BOX_TO_STRIP' | 'BREAK_STRIP_TO_LOOSE' | 'REPACK_LOOSE_TO_STRIP' | 'REPACK_STRIP_TO_BOX';
  qtyConverted: number;
  resultingText: string;
  performedBy: string;
}

const initialItems: UnitConversionItem[] = [
  { sku: 'ITM-001', itemName: 'Paracetamol 500mg (15s)', batchNo: 'DL-2309', stripsPerBox: 10, tabletsPerStrip: 15, boxesQty: 12, stripsQty: 4, looseQty: 4 },
  { sku: 'ITM-045', itemName: 'Augmentin 625 Duo (10s)', batchNo: 'AG-8811', stripsPerBox: 10, tabletsPerStrip: 10, boxesQty: 4, stripsQty: 5, looseQty: 0 },
  { sku: 'ITM-101', itemName: 'Telma 40mg Tablet (15s)', batchNo: 'TL-4412', stripsPerBox: 20, tabletsPerStrip: 15, boxesQty: 8, stripsQty: 2, looseQty: 6 },
  { sku: 'ITM-102', itemName: 'Pantocid 40mg Tablet (15s)', batchNo: 'PN-4422', stripsPerBox: 10, tabletsPerStrip: 15, boxesQty: 15, stripsQty: 8, looseQty: 2 },
];

const initialAuditLogs: ConversionAuditLog[] = [
  {
    id: 'CONV-9012',
    date: '2026-07-27 11:30 AM',
    itemName: 'Paracetamol 500mg (15s)',
    batchNo: 'DL-2309',
    actionType: 'BREAK_STRIP_TO_LOOSE',
    qtyConverted: 1,
    resultingText: '-1 Strip, +15 Loose Tablets',
    performedBy: 'Pharmacist Priya K.'
  },
  {
    id: 'CONV-8891',
    date: '2026-07-26 04:15 PM',
    itemName: 'Augmentin 625 Duo (10s)',
    batchNo: 'AG-8811',
    actionType: 'BREAK_BOX_TO_STRIP',
    qtyConverted: 1,
    resultingText: '-1 Box, +10 Strips',
    performedBy: 'Senior Pharmacist Ramesh'
  }
];

export const UnitConversionModule: React.FC = () => {
  const [items, setItems] = useState<UnitConversionItem[]>(initialItems);
  const [auditLogs, setAuditLogs] = useState<ConversionAuditLog[]>(initialAuditLogs);
  
  const [selectedSku, setSelectedSku] = useState<string>('ITM-001');
  const [conversionType, setConversionType] = useState<'BREAK_BOX_TO_STRIP' | 'BREAK_STRIP_TO_LOOSE' | 'REPACK_LOOSE_TO_STRIP' | 'REPACK_STRIP_TO_BOX'>('BREAK_STRIP_TO_LOOSE');
  const [convertQty, setConvertQty] = useState<number>(1);
  const [successMsg, setSuccessMsg] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');

  const activeItem = items.find(i => i.sku === selectedSku) || items[0];

  // Total base units = (boxes * stripsPerBox * tabletsPerStrip) + (strips * tabletsPerStrip) + loose
  const calculateTotalBaseUnits = (item: UnitConversionItem) => {
    return (item.boxesQty * item.stripsPerBox * item.tabletsPerStrip) + 
           (item.stripsQty * item.tabletsPerStrip) + 
           item.looseQty;
  };

  // Preview resulting stock after conversion
  const calculatePreview = () => {
    let newBoxes = activeItem.boxesQty;
    let newStrips = activeItem.stripsQty;
    let newLoose = activeItem.looseQty;
    let valid = true;
    let text = '';

    if (conversionType === 'BREAK_BOX_TO_STRIP') {
      if (activeItem.boxesQty < convertQty) {
        valid = false;
        text = `Insufficient Boxes! Available: ${activeItem.boxesQty}`;
      } else {
        newBoxes -= convertQty;
        newStrips += convertQty * activeItem.stripsPerBox;
        text = `Unpack ${convertQty} Box(es) ➔ +${convertQty * activeItem.stripsPerBox} Strips`;
      }
    } else if (conversionType === 'BREAK_STRIP_TO_LOOSE') {
      if (activeItem.stripsQty < convertQty) {
        valid = false;
        text = `Insufficient Strips! Available: ${activeItem.stripsQty}`;
      } else {
        newStrips -= convertQty;
        newLoose += convertQty * activeItem.tabletsPerStrip;
        text = `Unpack ${convertQty} Strip(s) ➔ +${convertQty * activeItem.tabletsPerStrip} Loose Tablets`;
      }
    } else if (conversionType === 'REPACK_LOOSE_TO_STRIP') {
      const requiredLoose = convertQty * activeItem.tabletsPerStrip;
      if (activeItem.looseQty < requiredLoose) {
        valid = false;
        text = `Insufficient Loose Tablets! Required: ${requiredLoose}, Available: ${activeItem.looseQty}`;
      } else {
        newLoose -= requiredLoose;
        newStrips += convertQty;
        text = `Repack ${requiredLoose} Loose Tablets ➔ +${convertQty} Strip(s)`;
      }
    } else if (conversionType === 'REPACK_STRIP_TO_BOX') {
      const requiredStrips = convertQty * activeItem.stripsPerBox;
      if (activeItem.stripsQty < requiredStrips) {
        valid = false;
        text = `Insufficient Strips! Required: ${requiredStrips}, Available: ${activeItem.stripsQty}`;
      } else {
        newStrips -= requiredStrips;
        newBoxes += convertQty;
        text = `Repack ${requiredStrips} Strips ➔ +${convertQty} Outer Box(es)`;
      }
    }

    return { newBoxes, newStrips, newLoose, valid, text };
  };

  const preview = calculatePreview();

  // Execute unit conversion
  const handleExecuteConversion = () => {
    setErrorMsg('');
    setSuccessMsg('');

    if (!preview.valid) {
      setErrorMsg(preview.text);
      return;
    }

    // Update state
    setItems(prev => prev.map(item => {
      if (item.sku === selectedSku) {
        return {
          ...item,
          boxesQty: preview.newBoxes,
          stripsQty: preview.newStrips,
          looseQty: preview.newLoose
        };
      }
      return item;
    }));

    // Add audit log
    const newLog: ConversionAuditLog = {
      id: `CONV-${Math.floor(1000 + Math.random() * 9000)}`,
      date: new Date().toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' }),
      itemName: activeItem.itemName,
      batchNo: activeItem.batchNo,
      actionType: conversionType,
      qtyConverted: convertQty,
      resultingText: preview.text,
      performedBy: 'Duty Pharmacist'
    };

    setAuditLogs(prev => [newLog, ...prev]);

    setSuccessMsg(`Successfully executed unit conversion for ${activeItem.itemName}: ${preview.text}`);
    setTimeout(() => setSuccessMsg(''), 5000);
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <h3 className="font-bold text-slate-900 text-lg flex items-center">
            <ArrowRightLeft className="w-5 h-5 mr-2 text-cyan-600" /> Multi-Unit Packaging Conversion & Break-Down Module
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Dynamically convert between Outer Box, Strip/Pack, and Loose Tablet fractions with real-time stock balance recalculation
          </p>
        </div>

        <div className="flex items-center space-x-2 text-xs font-mono bg-cyan-50 text-cyan-900 px-3 py-1.5 rounded-xl border border-cyan-200 font-bold shrink-0">
          <Boxes className="w-4 h-4 text-cyan-600 mr-1" /> Auto Unit Balance Guard: ACTIVE
        </div>
      </div>

      {/* Messages */}
      {successMsg && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs px-4 py-3 rounded-xl font-bold flex items-center">
          <CheckCircle2 className="w-4 h-4 mr-2 text-emerald-600 shrink-0" /> {successMsg}
        </div>
      )}

      {errorMsg && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 text-xs px-4 py-3 rounded-xl font-bold flex items-center">
          <AlertTriangle className="w-4 h-4 mr-2 text-rose-600 shrink-0" /> {errorMsg}
        </div>
      )}

      {/* Top 2 Columns: Conversion Calculator (Left) + Master Unit Ratio Register (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left: Dynamic Break-Down / Repack Form (7 Cols) */}
        <div className="lg:col-span-7 bg-slate-50 p-5 rounded-xl border border-slate-200 space-y-4">
          <h4 className="font-bold text-slate-900 text-sm flex items-center justify-between">
            <span className="flex items-center">
              <RefreshCw className="w-4 h-4 mr-2 text-cyan-600" /> Interactive Unit Conversion Execution
            </span>
            <span className="text-[10px] font-mono text-slate-500">Live Inventory Simulator</span>
          </h4>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-bold">
            <div>
              <label className="block text-slate-700 mb-1">Select Medicine SKU:</label>
              <select 
                value={selectedSku}
                onChange={(e) => setSelectedSku(e.target.value)}
                className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-slate-900 font-bold focus:ring-2 focus:ring-cyan-500"
              >
                {items.map(item => (
                  <option key={item.sku} value={item.sku}>
                    {item.itemName} (Batch: {item.batchNo})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-slate-700 mb-1">Conversion Operation:</label>
              <select 
                value={conversionType}
                onChange={(e) => setConversionType(e.target.value as any)}
                className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-slate-900 font-bold focus:ring-2 focus:ring-cyan-500"
              >
                <option value="BREAK_STRIP_TO_LOOSE">Unpack Strip ➔ Loose Tablets</option>
                <option value="BREAK_BOX_TO_STRIP">Unpack Outer Box ➔ Strips</option>
                <option value="REPACK_LOOSE_TO_STRIP">Repack Loose Tablets ➔ Strip</option>
                <option value="REPACK_STRIP_TO_BOX">Repack Strips ➔ Outer Box</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-bold">
            <div>
              <label className="block text-slate-700 mb-1">Quantity to Convert:</label>
              <input 
                type="number"
                min={1}
                value={convertQty}
                onChange={(e) => setConvertQty(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-slate-900 font-mono font-bold focus:ring-2 focus:ring-cyan-500"
              />
            </div>

            <div className="flex flex-col justify-end">
              <div className="text-[11px] font-mono text-slate-500 bg-white p-2 rounded-xl border border-slate-200">
                Packaging Ratios: <strong>1 Box = {activeItem.stripsPerBox} Strips</strong> | <strong>1 Strip = {activeItem.tabletsPerStrip} Base Units</strong>
              </div>
            </div>
          </div>

          {/* Live Preview Comparison Box */}
          <div className="p-4 bg-white rounded-xl border border-slate-200 space-y-3">
            <span className="text-xs font-bold text-slate-700 block uppercase tracking-wider text-[10px]">
              Stock Balance Simulation Preview
            </span>

            <div className="grid grid-cols-2 gap-4 text-xs font-mono">
              {/* Current Stock */}
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-1">
                <span className="text-[10px] text-slate-400 uppercase font-bold block">Current Stock</span>
                <div className="text-slate-800">Boxes: <strong>{activeItem.boxesQty}</strong></div>
                <div className="text-slate-800">Strips: <strong>{activeItem.stripsQty}</strong></div>
                <div className="text-slate-800">Loose: <strong>{activeItem.looseQty} Tablets</strong></div>
                <div className="text-slate-500 text-[10px] pt-1 border-t border-slate-200">
                  Total Base: {calculateTotalBaseUnits(activeItem)}
                </div>
              </div>

              {/* Resulting Stock */}
              <div className={`p-3 rounded-lg border space-y-1 ${preview.valid ? 'bg-cyan-50/50 border-cyan-200' : 'bg-rose-50 border-rose-200 text-rose-900'}`}>
                <span className={`text-[10px] uppercase font-bold block ${preview.valid ? 'text-cyan-700' : 'text-rose-700'}`}>
                  Resulting Stock
                </span>
                <div className="font-bold text-slate-900">Boxes: <strong>{preview.newBoxes}</strong></div>
                <div className="font-bold text-slate-900">Strips: <strong>{preview.newStrips}</strong></div>
                <div className="font-bold text-slate-900">Loose: <strong>{preview.newLoose} Tablets</strong></div>
                <div className="text-cyan-800 font-bold text-[10px] pt-1 border-t border-cyan-200">
                  Total Base: {calculateTotalBaseUnits({ ...activeItem, boxesQty: preview.newBoxes, stripsQty: preview.newStrips, looseQty: preview.newLoose })} (Preserved)
                </div>
              </div>
            </div>

            <div className="text-xs text-cyan-900 font-bold bg-cyan-100/60 p-2.5 rounded-lg flex items-center justify-between">
              <span>{preview.text}</span>
            </div>

            <button 
              onClick={handleExecuteConversion}
              disabled={!preview.valid}
              className={`w-full py-2.5 rounded-xl font-bold text-xs transition-all shadow-md flex items-center justify-center ${
                preview.valid 
                  ? 'bg-cyan-600 hover:bg-cyan-700 text-white' 
                  : 'bg-slate-300 text-slate-500 cursor-not-allowed'
              }`}
            >
              <ArrowRightLeft className="w-4 h-4 mr-2" /> Execute Unit Conversion & Update Stock Records
            </button>
          </div>
        </div>

        {/* Right: Packaging Conversion Hierarchy Matrix (5 Cols) */}
        <div className="lg:col-span-5 bg-slate-50 p-5 rounded-xl border border-slate-200 space-y-4 flex flex-col justify-between">
          <div className="space-y-3">
            <h4 className="font-bold text-slate-900 text-sm flex items-center">
              <Layers className="w-4 h-4 mr-2 text-indigo-600" /> Active Item Conversion Ratios
            </h4>

            <div className="divide-y divide-slate-200 border border-slate-200 rounded-xl bg-white overflow-hidden text-xs">
              {items.map(item => (
                <div key={item.sku} className="p-3 space-y-1 hover:bg-slate-50 transition-colors">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900">{item.itemName}</span>
                    <span className="font-mono text-[10px] text-slate-400">{item.batchNo}</span>
                  </div>
                  <div className="text-[11px] font-mono text-slate-600 flex items-center justify-between">
                    <span>1 Outer Box = <strong className="text-cyan-700">{item.stripsPerBox} Strips</strong></span>
                    <span>1 Strip = <strong className="text-cyan-700">{item.tabletsPerStrip} Tablets</strong></span>
                  </div>
                  <div className="text-[10px] text-emerald-800 font-mono font-bold bg-emerald-50 p-1.5 rounded flex justify-between">
                    <span>Stock: {item.boxesQty} Boxes, {item.stripsQty} Strips, {item.looseQty} Loose</span>
                    <span>Total Base: {calculateTotalBaseUnits(item)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-indigo-50/70 p-3 rounded-xl border border-indigo-200 text-indigo-950 text-xs space-y-1">
            <div className="font-bold flex items-center text-indigo-900">
              <Shield className="w-3.5 h-3.5 mr-1.5 text-indigo-600" /> Relational Stock Conservation Law
            </div>
            <p className="text-[11px] text-indigo-800 leading-relaxed">
              Converting units never alters total base tablet quantity or stock inventory valuation. Total base count remains 100% constant across transformations.
            </p>
          </div>
        </div>

      </div>

      {/* Unit Conversion Audit Ledger */}
      <div className="space-y-3 pt-2">
        <h4 className="font-bold text-slate-900 text-sm flex items-center">
          <Clock className="w-4 h-4 mr-2 text-slate-600" /> Packaging Unit Breakdown Audit Ledger
        </h4>

        <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
          <table className="w-full text-left text-xs font-mono border-collapse">
            <thead>
              <tr className="bg-slate-100 text-slate-600 font-bold text-[10px] uppercase border-b border-slate-200">
                <th className="p-3">Ref ID</th>
                <th className="p-3">Timestamp</th>
                <th className="p-3 font-sans">Medicine Name</th>
                <th className="p-3">Batch</th>
                <th className="p-3 font-sans">Conversion Details</th>
                <th className="p-3 font-sans">Performed By</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {auditLogs.map(log => (
                <tr key={log.id} className="hover:bg-slate-50">
                  <td className="p-3 font-bold text-slate-900">{log.id}</td>
                  <td className="p-3 text-slate-500 text-[11px] font-sans">{log.date}</td>
                  <td className="p-3 font-sans font-bold text-slate-800">{log.itemName}</td>
                  <td className="p-3 text-cyan-700">{log.batchNo}</td>
                  <td className="p-3 font-sans text-emerald-800 font-bold bg-emerald-50/50">
                    {log.resultingText}
                  </td>
                  <td className="p-3 font-sans text-slate-600 flex items-center">
                    <User className="w-3 h-3 mr-1 text-slate-400" /> {log.performedBy}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
