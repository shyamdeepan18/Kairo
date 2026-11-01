import React, { useState } from 'react';
import { 
  BookOpen, Layers, CheckCircle2, HelpCircle, ArrowRight, 
  Package, ShoppingCart, Factory, Scale, FileText, 
  ShieldCheck, AlertTriangle, ChevronDown, ChevronRight,
  Sparkles, Truck, DollarSign, RefreshCw, Landmark
} from 'lucide-react';
import { usePlantStore } from '../../store/plant';

interface BlueprintGuide {
  id: string;
  name: string;
  badge: string;
  description: string;
  stages: Array<{
    title: string;
    description: string;
    screens: Array<{
      name: string;
      route: string;
      prerequisites: string;
      instructions: string;
      accountingImpact: string;
    }>;
  }>;
  faqs: Array<{
    question: string;
    answer: string;
  }>;
}

const BLUEPRINT_GUIDES: BlueprintGuide[] = [
  {
    id: 'mfg_food',
    name: 'Food & Beverage Processing',
    badge: 'Category A: Manufacturing',
    description: 'Designed for batch manufacturing, recipe formulations, raw ingredient expiry tracking (FEFO), co-product/scrap recovery, and lot traceability.',
    stages: [
      {
        title: 'Stage 1: Master Data & Recipe Setup',
        description: 'Configure standard units, perishable ingredients with shelf-life, and multi-stage batch recipes.',
        screens: [
          {
            name: 'Items Master',
            route: '/masters/items',
            prerequisites: 'Chart of Accounts and Unit of Measure (KG, LTR, GMS)',
            instructions: 'Create Raw Ingredients (RM), Packaging Material (PM), and Finished Goods (FG). Enable "Batch / Lot Tracking" and configure "Shelf Life Days" so expiry dates auto-calculate upon receipt.',
            accountingImpact: 'Links items to inventory asset accounts (Inventory RM, Inventory Finished Goods).'
          },
          {
            name: 'Formulas & BOM (Recipe)',
            route: '/manufacturing/bom',
            prerequisites: 'Items Master (RM, PM, and target FG items)',
            instructions: 'Create a production formula with standard batch size. Specify required input ingredients with wastage tolerances, and define output yields including scrap or by-products with cost allocation percentages.',
            accountingImpact: 'Provides the standard cost roll-up baseline for production variance analysis.'
          },
          {
            name: 'Work Centres & Stations',
            route: '/manufacturing/work-centres',
            prerequisites: 'General Ledger Overhead absorption accounts',
            instructions: 'Define processing stations (e.g. Mixing, Pasteurization, Packaging) and enter hourly rates for direct labour and machine runtime.',
            accountingImpact: 'Standard hourly rates drive overhead and labour absorption journal entries during batch runs.'
          }
        ]
      },
      {
        title: 'Stage 2: Ingredient Procurement & Inward Quality',
        description: 'Procure raw materials from certified farmers/vendors with automated batch numbering and shelf-life capture.',
        screens: [
          {
            name: 'Blanket Purchase Orders',
            route: '/purchase/blanket-orders',
            prerequisites: 'Approved Supplier and Item Master',
            instructions: 'Lock in seasonal ingredient rates and total agreed quantity over a delivery timeframe. Call off specific delivery schedules against the blanket order.',
            accountingImpact: 'Commitment tracking only; no general ledger impact until Goods Receipt.'
          },
          {
            name: 'Goods Receipt Note (GRN)',
            route: '/purchase/grn',
            prerequisites: 'Approved Purchase Order',
            instructions: 'Inspect incoming shipment, enter supplier batch number and manufacturer expiry date. Only accepted quantities post to warehouse stock.',
            accountingImpact: 'Debits Inventory Asset (Raw Materials) at purchase price and Credits GRN Clearing Account.'
          },
          {
            name: 'Landed Cost Vouchers',
            route: '/purchase/landed-cost-vouchers',
            prerequisites: 'Posted GRN and freight/inward transport bills',
            instructions: 'Apportion third-party transportation, cold-chain freight, and unloading costs across received ingredient lines by value or weight.',
            accountingImpact: 'Capitalizes landed freight directly into inventory valuation rate (WAC), crediting Accounts Payable.'
          }
        ]
      },
      {
        title: 'Stage 3: Shopfloor Production & Batch Execution',
        description: 'Execute batch orders, issue batch-tracked ingredients, record machine hours, and pack finished products.',
        screens: [
          {
            name: 'Production Orders & Process Batches',
            route: '/manufacturing/orders',
            prerequisites: 'Approved BOM / Formula and available ingredient stock',
            instructions: 'Create a production order for the desired batch size. Issue raw ingredients from warehouse to WIP (Work in Progress). Track operation completions and record machine run hours.',
            accountingImpact: 'Issue: DR Work-in-Progress (WIP) / CR Raw Material Inventory. Receipt: DR Finished Goods Inventory / CR WIP.'
          },
          {
            name: 'Process Batches',
            route: '/manufacturing/batches',
            prerequisites: 'Active Production Orders',
            instructions: 'Monitor batch progress, review QC release status, and track yields across multi-day manufacturing runs.',
            accountingImpact: 'Ensures traceability for lot recall and FDA/FSSAI regulatory audits.'
          }
        ]
      },
      {
        title: 'Stage 4: Quality Dispatch & Sales Distribution',
        description: 'Dispatch finished products to distributors using First-Expiry-First-Out (FEFO) rules to eliminate expired inventory.',
        screens: [
          {
            name: 'Sales Orders',
            route: '/sales/orders',
            prerequisites: 'Active Customer Master and Price List',
            instructions: 'Book distributor orders with delivery dates, negotiated pricing, and applicable GST tax rules.',
            accountingImpact: 'Reserves inventory; financial postings occur upon dispatch and invoicing.'
          },
          {
            name: 'Delivery Challans (FEFO Dispatches)',
            route: '/sales/delivery',
            prerequisites: 'Approved Sales Order and available FG stock',
            instructions: 'Click "Auto FEFO Pick Batches" to automatically select the oldest valid lot numbers. Verify quantities and approve the dispatch.',
            accountingImpact: 'Posts stock OUT from inventory and triggers COGS ledger posting: DR Cost of Goods Sold (COGS) / CR Finished Goods Inventory at WAC.'
          },
          {
            name: 'Tax Invoices & Receipts',
            route: '/sales/invoices',
            prerequisites: 'Posted Delivery Challan or Direct Counter Sale',
            instructions: 'Generate GST-compliant tax invoice. Record bank transfers, NEFT, or PDC receipts against outstanding invoice balances.',
            accountingImpact: 'Invoice: DR Accounts Receivable / CR Sales Revenue & Output GST. Receipt: DR Bank Account / CR Accounts Receivable.'
          }
        ]
      }
    ],
    faqs: [
      {
        question: 'Why are Industry Bundles applied at the Company level rather than Plant level?',
        answer: 'Chart of Accounts, Item Masters, Tax Rules, and financial policies are enterprise-wide definitions owned by the legal entity (Company). Plants represent physical execution facilities (e.g. Plant A Processing, Plant B Packaging) that operate under the company\'s master bundle. Running different bundles per company ensures clean double-entry accounting and unified GST reporting.'
      },
      {
        question: 'How does the FEFO (First-Expiry-First-Out) engine select lots?',
        answer: 'When preparing a delivery challan, the FEFO engine sorts available item batches in the source warehouse by expiry date ascending. It automatically assigns the earliest expiring batches first to prevent spoilage and dead inventory.'
      },
      {
        question: 'Can I edit a posted journal entry or invoice?',
        answer: 'No. This ERP strictly adheres to an append-only financial model. Once an invoice or journal voucher is approved, it cannot be modified or deleted. To correct an erroneous transaction, post a Credit Note, Debit Note, or Reversal Journal Voucher.'
      },
      {
        question: 'How does Landed Cost Voucher (GAP 3) affect my ingredient valuation?',
        answer: 'When inward freight or cold-storage transport is incurred, the Landed Cost Voucher distributes those expenses across the received items. This updates the Weighted Average Cost (WAC) of the raw materials so that production cost roll-ups reflect true landed expenditure.'
      }
    ]
  },
  {
    id: 'mfg_discrete',
    name: 'Electronics & Discrete Assembly',
    badge: 'Category A: Manufacturing',
    description: 'Tailored for multi-level assembly, serial number serialization, component BOMs, work-centre run hours, and subcontracted job work.',
    stages: [
      {
        title: 'Stage 1: Component Masters & Multi-Level BOM',
        description: 'Define electronic components, PCB assemblies, and final box-build routings.',
        screens: [
          {
            name: 'Items & Serial Master',
            route: '/masters/items',
            prerequisites: 'Item Groups (Components, Hardware, Assemblies)',
            instructions: 'Configure parts with serial or batch tracking. Maintain vendor part numbers and standard purchase units.',
            accountingImpact: 'Links to inventory sub-ledgers for Raw Materials and Sub-Assemblies.'
          },
          {
            name: 'Formulas & Assembly Routing',
            route: '/manufacturing/bom',
            prerequisites: 'Items Master and Work Centres',
            instructions: 'Structure multi-level bills of materials detailing component quantities, assembly hardware, solder consumables, and test routing.',
            accountingImpact: 'Establishes standard material + machine hour absorption rates.'
          }
        ]
      },
      {
        title: 'Stage 2: Subcontracting & Job Work (GAP 4)',
        description: 'Send raw components to external job-workers for specialized processing (e.g. SMT soldering, powder coating).',
        screens: [
          {
            name: 'Job Work Orders & Challans',
            route: '/manufacturing/subcontracting',
            prerequisites: 'Subcontractor Party Master and Service BOM',
            instructions: 'Create Job Work Orders specifying input materials sent and expected finished assembly received. Issue Section 143 Job Work Challans for GST transport compliance.',
            accountingImpact: 'Transfers stock to Subcontractor Warehouse without recognizing sale; absorbs job-work service charges into final assembly valuation.'
          }
        ]
      },
      {
        title: 'Stage 3: Assembly Execution & Serialization',
        description: 'Assemble sub-units, run quality tests, record serial numbers, and complete finished goods.',
        screens: [
          {
            name: 'Production Orders',
            route: '/manufacturing/orders',
            prerequisites: 'Approved Assembly BOM',
            instructions: 'Release assembly work orders. Complete routing steps (SMT $\\rightarrow$ Through-Hole $\\rightarrow$ Testing $\\rightarrow$ Packaging). Record actual machine run hours.',
            accountingImpact: 'Rolls up material costs, labour hours, and machine electricity absorption into finished stock.'
          }
        ]
      }
    ],
    faqs: [
      {
        question: 'How is Subcontracted Job Work accounted for under GST rules?',
        answer: 'Materials sent to job workers under GST Section 143 do not trigger sales tax provided they return within 1 year (inputs) or 3 years (capital goods). Stock moves to a dedicated Subcontractor Location, and only the service processing fee is billed with GST ITC.'
      },
      {
        question: 'How do Work Centre hourly rates impact manufacturing costs?',
        answer: 'Each work centre has configured hourly rates for labour, machine runtime, and indirect overhead. When an operation is marked complete with actual elapsed minutes, the posting engine automatically capitalizes these amounts into Work-in-Progress (WIP).'
      }
    ]
  },
  {
    id: 'trade_wholesale',
    name: 'Wholesale Distribution & Stockist',
    badge: 'Category B: Trading & Distribution',
    description: 'Optimized for high-volume traders, multi-branch warehouses, tiered customer credit limits, and delivery challan dispatches without manufacturing overhead.',
    stages: [
      {
        title: 'Stage 1: Multi-Warehouse & Price Lists',
        description: 'Manage regional stock depots, bulk pack conversions, and volume discount slabs.',
        screens: [
          {
            name: 'Plants & Warehouses',
            route: '/settings/plants',
            prerequisites: 'Company legal registration and GSTIN',
            instructions: 'Set up regional warehouses (e.g. Central Depot, Transit Hub, Branch Godown). Assign default stock locations per plant.',
            accountingImpact: 'Each warehouse is mapped to company-level stock valuation accounts.'
          },
          {
            name: 'Stock Transfers',
            route: '/inventory/transfers',
            prerequisites: 'Source and Destination Warehouses',
            instructions: 'Create stock transfers between branch locations. Use 2-step In-Transit transfers to track inventory while moving across state borders.',
            accountingImpact: 'Direct Transfer: Immediate warehouse balance shift. In-Transit: DR Stock-in-Transit / CR Source Warehouse, cleared upon destination receipt.'
          }
        ]
      },
      {
        title: 'Stage 2: High-Volume Order Fulfillment',
        description: 'Process customer purchase orders, verify credit limits, issue delivery challans, and track receivables.',
        screens: [
          {
            name: 'Sales Orders & Credit Limits',
            route: '/sales/orders',
            prerequisites: 'Customer Master with Approved Credit Limit',
            instructions: 'Book bulk wholesale orders. If customer exceeds credit days or credit limit, the system requires administrative approval before release.',
            accountingImpact: 'Credit control check ensures business risk compliance prior to stock commitment.'
          },
          {
            name: 'Deliveries & Tax Invoicing',
            route: '/sales/delivery',
            prerequisites: 'Approved Sales Orders',
            instructions: 'Generate Delivery Challans with vehicle number and e-Way bill details. Convert to B2B Tax Invoices with single-click posting.',
            accountingImpact: 'Recognizes Sales Revenue, Output GST liability, and updates Stock Ledger at Weighted Average Cost (WAC).'
          }
        ]
      }
    ],
    faqs: [
      {
        question: 'What happens to inventory valuation during multi-plant transfers?',
        answer: 'Inventory transfers move stock at current Weighted Average Cost (WAC). No profit or markup is recognized on intra-company transfers, preserving accounting integrity across regional branches.'
      },
      {
        question: 'How do Customer Credit Limits protect wholesale operations?',
        answer: 'Customer credit limits compare current ledger balance plus pending un-invoiced orders against the authorized ceiling. When exceeded, dispatches are blocked until outstanding payments are reconciled.'
      }
    ]
  },
  {
    id: 'trade_retail_pos',
    name: 'Retail Counter POS & Micro-Trading',
    badge: 'Category B: Trading & Distribution',
    description: 'Fast, single-screen counter billing designed for walk-in retail, instant barcode scanning, multi-mode payment settlement (Cash/Card/UPI), and immediate stock decrement.',
    stages: [
      {
        title: 'Stage 1: Counter Sales & Split Payments',
        description: 'Point-of-sale execution for quick retail transactions.',
        screens: [
          {
            name: 'Quick Bill (POS)',
            route: '/sales/quick-invoice',
            prerequisites: 'Active Items with Retail Prices and Cash/Bank Accounts',
            instructions: 'Scan barcodes or search item names, select customer or walk-in retail, split payment across Cash, Card, or UPI, and print thermal receipt instantly.',
            accountingImpact: 'Immediately posts Sales Revenue, Output GST, COGS expense, and increases Cash/Bank accounts in a single atomic transaction.'
          }
        ]
      }
    ],
    faqs: [
      {
        question: 'How does Quick Bill differ from standard Sales Invoicing?',
        answer: 'Standard B2B sales follow Quotation $\\rightarrow$ Order $\\rightarrow$ Delivery $\\rightarrow$ Invoice. Quick Bill merges order, delivery, and payment receipt into a single 3-second workflow ideal for retail counters.'
      }
    ]
  }
];

export function UserGuidePage() {
  const { company } = usePlantStore();
  const [selectedBlueprintId, setSelectedBlueprintId] = useState<string>('mfg_food');
  const [expandedFaq, setExpandedFaq] = useState<number | null>(0);

  const activeGuide = BLUEPRINT_GUIDES.find((b) => b.id === selectedBlueprintId) || BLUEPRINT_GUIDES[0];

  return (
    <div className="h-full flex flex-col bg-slate-50 dark:bg-slate-950 min-h-screen text-slate-900 dark:text-slate-100 transition-colors">
      {/* Universal Page Header Bar */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/40 rounded-xl">
            <BookOpen className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold tracking-wider text-slate-500 dark:text-slate-400 uppercase">Knowledge Base</span>
              <span className="text-xs text-slate-300 dark:text-slate-700">/</span>
              <span className="text-xs font-medium text-indigo-600 dark:text-indigo-400">User Guide</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              System Workflow & Operations Guide
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Interactive process documentation, screen prerequisites, accounting impact, and industry best practices
            </p>
          </div>
        </div>

        {/* Company Context Pill */}
        <div className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/50 rounded-xl text-xs">
          <ShieldCheck className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          <span className="text-slate-600 dark:text-slate-300">Active Company:</span>
          <span className="font-bold text-indigo-700 dark:text-indigo-300">{company?.name || 'KAIRO Enterprise'}</span>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="p-6 max-w-7xl mx-auto w-full flex-1 flex flex-col gap-6">
        {/* Industry Bundle Selector Header */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                Industry Blueprint Guide
              </span>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white mt-1">
                Select Industry Workflow
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Blueprints determine default module configurations, chart of accounts mappings, and operational routing
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400">Active Blueprint:</span>
              <span className="px-3 py-1 bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 font-semibold text-xs rounded-lg">
                {activeGuide.name}
              </span>
            </div>
          </div>

          {/* Blueprint Selection Pills */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {BLUEPRINT_GUIDES.map((b) => {
              const isSelected = b.id === selectedBlueprintId;
              return (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setSelectedBlueprintId(b.id)}
                  className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-indigo-50/80 dark:bg-indigo-950/40 border-indigo-500 ring-2 ring-indigo-500/20'
                      : 'bg-white dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                  }`}
                >
                  <div className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                    {b.badge}
                  </div>
                  <div className="font-bold text-sm text-slate-900 dark:text-white mt-1">
                    {b.name}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
                    {b.description}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Blueprint Overview Box */}
        <div className="bg-gradient-to-r from-indigo-500/10 via-indigo-500/5 to-transparent border border-indigo-200 dark:border-indigo-900/50 rounded-2xl p-5 shadow-xs">
          <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 text-xs font-bold uppercase tracking-wider">
            <Sparkles className="w-4 h-4" /> Blueprint Workflow Summary
          </div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-white mt-1">
            {activeGuide.name} Workflow Architecture
          </h3>
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-1 max-w-4xl">
            {activeGuide.description}
          </p>
        </div>

        {/* Workflow Stages & Screen Guides */}
        <div className="flex flex-col gap-6">
          {activeGuide.stages.map((stage, idx) => (
            <div 
              key={idx}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs"
            >
              <div className="flex items-center gap-3 border-b border-slate-100 dark:border-slate-800 pb-4 mb-5">
                <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white font-bold flex items-center justify-center text-sm shadow-xs">
                  {idx + 1}
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    {stage.title}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {stage.description}
                  </p>
                </div>
              </div>

              {/* Screens Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {stage.screens.map((screen, sIdx) => (
                  <div 
                    key={sIdx}
                    className="p-4 bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-700/60 rounded-xl flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-bold text-sm text-slate-900 dark:text-white">
                          {screen.name}
                        </span>
                        <span className="font-mono text-[10px] px-2 py-0.5 bg-slate-200 dark:bg-slate-700 rounded text-slate-600 dark:text-slate-300">
                          {screen.route}
                        </span>
                      </div>

                      <div className="mb-2.5">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 block mb-0.5">
                          Prerequisites
                        </span>
                        <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                          {screen.prerequisites}
                        </p>
                      </div>

                      <div className="mb-2.5">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 block mb-0.5">
                          Instructions & Action Rules
                        </span>
                        <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                          {screen.instructions}
                        </p>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-200/60 dark:border-slate-700/60 mt-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 block mb-0.5">
                        Financial & Inventory Invariant
                      </span>
                      <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                        {screen.accountingImpact}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Common FAQs & Architecture Rules */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs">
          <div className="flex items-center gap-3 border-b border-slate-100 dark:border-slate-800 pb-4 mb-5">
            <div className="p-2 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 rounded-xl">
              <HelpCircle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Frequently Asked Questions & System Invariants
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Core accounting integrity, stock ledger protection, and transaction rules
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            {activeGuide.faqs.map((faq, fIdx) => {
              const isOpen = expandedFaq === fIdx;
              return (
                <div 
                  key={fIdx}
                  className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden transition-all"
                >
                  <button
                    type="button"
                    onClick={() => setExpandedFaq(isOpen ? null : fIdx)}
                    className="w-full px-5 py-3.5 bg-slate-50/50 dark:bg-slate-800/40 flex justify-between items-center text-left cursor-pointer hover:bg-slate-100/50 dark:hover:bg-slate-800/60"
                  >
                    <span className="font-semibold text-sm text-slate-900 dark:text-white">
                      {faq.question}
                    </span>
                    {isOpen ? (
                      <ChevronDown className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                    )}
                  </button>
                  {isOpen && (
                    <div className="px-5 py-4 bg-white dark:bg-slate-900 text-xs text-slate-600 dark:text-slate-300 leading-relaxed border-t border-slate-100 dark:border-slate-800">
                      {faq.answer}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export default UserGuidePage;

