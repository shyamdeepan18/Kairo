const fs = require('fs');
const path = require('path');

const files = [
  'apps/web/src/pages/purchase/PurchaseOrders.tsx',
  'apps/web/src/pages/purchase/Grn.tsx',
  'apps/web/src/pages/purchase/Invoices.tsx',
  'apps/web/src/pages/sales/SalesOrders.tsx',
  'apps/web/src/pages/sales/Deliveries.tsx',
  'apps/web/src/pages/sales/SalesInvoices.tsx'
];

for (const file of files) {
  const p = path.join(__dirname, file);
  if (!fs.existsSync(p)) continue;
  let code = fs.readFileSync(p, 'utf8');

  // Drawer form containers
  code = code.replace(/bg-slate-50 rounded-xl border border-slate-100/g, 'bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-700/50');
  
  // Drawer list containers
  code = code.replace(/border border-slate-200 rounded-lg bg-white overflow-hidden/g, 'border border-slate-200 dark:border-slate-700/50 rounded-lg bg-white dark:bg-slate-900 overflow-hidden');
  code = code.replace(/border border-slate-200 rounded-lg overflow-x-auto/g, 'border border-slate-200 dark:border-slate-700/50 rounded-lg overflow-x-auto');
  
  // Table headers
  code = code.replace(/bg-slate-50 border-b text-xs text-slate-500 uppercase/g, 'bg-slate-50 dark:bg-slate-800/80 border-b dark:border-slate-700/50 text-xs text-slate-500 dark:text-slate-400 uppercase');
  code = code.replace(/bg-slate-50 border-b border-slate-200 text-xs text-slate-500 uppercase/g, 'bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700/50 text-xs text-slate-500 dark:text-slate-400 uppercase');
  
  // Table bodies
  code = code.replace(/divide-y divide-slate-100/g, 'divide-y divide-slate-100 dark:divide-slate-700/50');
  code = code.replace(/<tr key=\{l\.id\} className="bg-white">/g, '<tr key={l.id} className="bg-white dark:bg-slate-900">');
  
  // Text colors
  code = code.replace(/text-slate-700/g, 'text-slate-700 dark:text-slate-300');
  code = code.replace(/text-slate-800/g, 'text-slate-800 dark:text-slate-200');
  code = code.replace(/text-slate-900/g, 'text-slate-900 dark:text-white');
  code = code.replace(/text-slate-500/g, 'text-slate-500 dark:text-slate-400');
  
  // Highlight boxes
  code = code.replace(/bg-indigo-50 border border-indigo-100/g, 'bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-100 dark:border-indigo-800/50');
  code = code.replace(/bg-blue-50 border border-blue-100/g, 'bg-blue-50 dark:bg-blue-900/30 border border-blue-100 dark:border-blue-800/50');
  code = code.replace(/bg-pink-50 border border-pink-100/g, 'bg-pink-50 dark:bg-pink-900/30 border border-pink-100 dark:border-pink-800/50');
  code = code.replace(/bg-purple-50 border border-purple-100/g, 'bg-purple-50 dark:bg-purple-900/30 border border-purple-100 dark:border-purple-800/50');

  fs.writeFileSync(p, code);
}
