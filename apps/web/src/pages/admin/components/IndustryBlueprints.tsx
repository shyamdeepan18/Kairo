import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Card,
  Button,
  Tag,
  Select,
  Modal,
  Switch,
  message,
  Tabs,
  Badge,
  Divider,
} from 'antd';
import {
  Layers,
  CheckCircle2,
  Sliders,
  Sparkles,
  Building2,
  Factory,
  ShoppingCart,
  Wheat,
  HardHat,
  Wrench,
  ShieldCheck,
  Check,
  RefreshCw,
} from 'lucide-react';
import {
  adminApi,
  type AdminCompany,
  type IndustryBlueprint,
  type CompanyModuleRecord,
} from '../../../api/admin';

interface IndustryBlueprintsProps {
  companies: AdminCompany[];
  selectedCompany?: AdminCompany | null;
}

export function IndustryBlueprints({ companies, selectedCompany }: IndustryBlueprintsProps) {
  const [activeCompanyId, setActiveCompanyId] = useState<string | undefined>(selectedCompany?.id);
  const [blueprints, setBlueprints] = useState<IndustryBlueprint[]>([]);
  const [companyModules, setCompanyModules] = useState<CompanyModuleRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // Blueprint Confirmation Modal
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [targetBlueprint, setTargetBlueprint] = useState<IndustryBlueprint | null>(null);

  useEffect(() => {
    if (selectedCompany?.id) {
      setActiveCompanyId(selectedCompany.id);
    } else if (companies.length > 0 && !activeCompanyId) {
      setActiveCompanyId(companies[0].id);
    }
  }, [selectedCompany?.id, companies, activeCompanyId]);

  // Load Blueprints
  useEffect(() => {
    adminApi
      .listBlueprints()
      .then(setBlueprints)
      .catch(() => message.error('Failed to load industry blueprints'));
  }, []);

  // Load Company Modules when active company changes
  const loadCompanyModules = useCallback(async () => {
    if (!activeCompanyId) return;
    setLoading(true);
    try {
      const res = await adminApi.getCompanyModules(activeCompanyId);
      setCompanyModules(res);
    } catch {
      message.error('Failed to load company modules');
    } finally {
      setLoading(false);
    }
  }, [activeCompanyId]);

  useEffect(() => {
    loadCompanyModules();
  }, [loadCompanyModules]);

  const activeCompany = useMemo(
    () => companies.find((c) => c.id === activeCompanyId),
    [companies, activeCompanyId]
  );

  const enabledModuleSet = useMemo(() => {
    return new Set(companyModules.filter((m) => m.isEnabled).map((m) => m.module));
  }, [companyModules]);

  // Toggle single module
  const handleToggleModule = async (module: string, isEnabled: boolean) => {
    if (!activeCompanyId) return;
    try {
      await adminApi.toggleCompanyModule(activeCompanyId, module, isEnabled);
      message.success(`Module '${module}' ${isEnabled ? 'enabled' : 'disabled'}`);
      loadCompanyModules();
    } catch (e: any) {
      message.error(e?.response?.data?.error || 'Failed to update module state');
    }
  };

  // Open apply confirm modal
  const promptApply = (bp: IndustryBlueprint) => {
    setTargetBlueprint(bp);
    setConfirmModalOpen(true);
  };

  // Apply Blueprint
  const handleApplyBlueprint = async () => {
    if (!activeCompanyId || !targetBlueprint) return;
    setApplying(true);
    try {
      await adminApi.applyBlueprint(activeCompanyId, targetBlueprint.id);
      message.success(`Applied '${targetBlueprint.name}' blueprint successfully!`);
      setConfirmModalOpen(false);
      setTargetBlueprint(null);
      loadCompanyModules();
    } catch (e: any) {
      message.error(e?.response?.data?.error || 'Failed to apply blueprint');
    } finally {
      setApplying(false);
    }
  };

  // Filter blueprints by category
  const filteredBlueprints = useMemo(() => {
    if (selectedCategory === 'all') return blueprints;
    return blueprints.filter((b) => b.category.toLowerCase().includes(selectedCategory.toLowerCase()));
  }, [blueprints, selectedCategory]);

  const getCategoryIcon = (category: string) => {
    if (category.includes('Manufacturing')) return <Factory className="w-4 h-4 text-indigo-600" />;
    if (category.includes('Trading')) return <ShoppingCart className="w-4 h-4 text-emerald-600" />;
    if (category.includes('Agriculture')) return <Wheat className="w-4 h-4 text-amber-600" />;
    if (category.includes('Infrastructure')) return <HardHat className="w-4 h-4 text-orange-600" />;
    return <Wrench className="w-4 h-4 text-cyan-600" />;
  };

  const ALL_MODULES = [
    { key: 'purchase', label: 'Purchase & Procurement', color: 'blue' },
    { key: 'inventory', label: 'Inventory & Warehousing', color: 'cyan' },
    { key: 'accounting', label: 'General Ledger & Banking', color: 'purple' },
    { key: 'sales', label: 'Sales & Invoicing', color: 'green' },
    { key: 'manufacturing', label: 'Manufacturing & BOM Routing', color: 'geekblue' },
    { key: 'hr', label: 'HR Management', color: 'magenta' },
    { key: 'payroll', label: 'Payroll & Statutory', color: 'gold' },
  ];

  return (
    <div className="space-y-6">
      {/* Top Controls Banner */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Layers className="w-5 h-5 text-indigo-600" />
            Industry Blueprints & Feature Bundles
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Switch between specialized industry bundles (Manufacturing, Trading/POS, Agro-Milling, Infrastructure, Services).
            Enables only relevant modules and screens for the selected enterprise without microservice complexity.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-600 dark:text-slate-300">TARGET COMPANY:</span>
            <Select
              style={{ minWidth: 240 }}
              value={activeCompanyId}
              onChange={setActiveCompanyId}
              options={companies.map((c) => ({
                value: c.id,
                label: `${c.name} ${c.legalName ? `(${c.legalName})` : ''}`,
              }))}
            />
          </div>
          <Button icon={<RefreshCw className="w-4 h-4" />} onClick={loadCompanyModules} loading={loading} />
        </div>
      </div>

      {/* Active Company Module Switcher Strip */}
      {activeCompany && (
        <Card
          size="small"
          className="border-slate-200 dark:border-slate-800 shadow-sm bg-gradient-to-r from-slate-50 to-indigo-50/20 dark:from-slate-900 dark:to-slate-800/40"
          title={
            <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
              <span className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-indigo-600" />
                Live Feature Toggles for {activeCompany.name}
              </span>
              <span className="text-slate-400 font-normal lowercase">
                {enabledModuleSet.size} of {ALL_MODULES.length} modules enabled
              </span>
            </div>
          }
        >
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 py-1">
            {ALL_MODULES.map((m) => {
              const isEnabled = enabledModuleSet.has(m.key);
              return (
                <div
                  key={m.key}
                  className={`p-2.5 rounded-lg border transition-all flex flex-col justify-between ${
                    isEnabled
                      ? 'bg-white dark:bg-slate-800 border-indigo-200 dark:border-indigo-900 shadow-sm'
                      : 'bg-slate-100/60 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800 opacity-60'
                  }`}
                >
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate" title={m.label}>
                      {m.label.split(' ')[0]}
                    </span>
                    <Switch
                      size="small"
                      checked={isEnabled}
                      onChange={(checked) => handleToggleModule(m.key, checked)}
                    />
                  </div>
                  <Tag color={isEnabled ? m.color : 'default'} className="text-[10px] m-0 w-fit">
                    {isEnabled ? 'ACTIVE' : 'DISABLED'}
                  </Tag>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Category Filter Tabs */}
      <Tabs
        activeKey={selectedCategory}
        onChange={setSelectedCategory}
        items={[
          { key: 'all', label: `All Blueprints (${blueprints.length})` },
          { key: 'manufacturing', label: 'Category A: Manufacturing' },
          { key: 'trading', label: 'Category B: Trading & Retail POS' },
          { key: 'agriculture', label: 'Category C: Agro-Industry' },
          { key: 'infrastructure', label: 'Category D: Infrastructure' },
          { key: 'service', label: 'Category E: Service Businesses' },
        ]}
      />

      {/* Blueprints Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filteredBlueprints.map((bp) => {
          // Check if this blueprint matches current company's enabled modules
          const matchesCurrent =
            bp.modules.every((m) => enabledModuleSet.has(m)) &&
            ALL_MODULES.filter((m) => !bp.modules.includes(m.key)).every((m) => !enabledModuleSet.has(m.key));

          return (
            <Card
              key={bp.id}
              className={`border transition-all hover:shadow-md flex flex-col justify-between ${
                matchesCurrent
                  ? 'border-indigo-500 dark:border-indigo-600 ring-2 ring-indigo-500/20 shadow-md'
                  : 'border-slate-200 dark:border-slate-800'
              }`}
              title={
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 truncate">
                    {getCategoryIcon(bp.category)}
                    <span className="font-bold text-sm text-slate-800 dark:text-slate-100 truncate" title={bp.name}>
                      {bp.name}
                    </span>
                  </div>
                  {matchesCurrent && (
                    <Tag color="green" icon={<Check className="w-3 h-3 inline" />}>
                      ACTIVE
                    </Tag>
                  )}
                </div>
              }
            >
              <div className="space-y-4">
                <div className="text-xs text-slate-400 font-medium">
                  {bp.category}
                </div>

                <p className="text-xs text-slate-600 dark:text-slate-400 min-h-[48px]">
                  {bp.description}
                </p>

                <div>
                  <div className="text-[11px] font-bold uppercase text-slate-400 tracking-wider mb-1.5">
                    Included Modules
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {bp.modules.map((m) => (
                      <Tag key={m} color="blue" className="text-[11px]">
                        {m.toUpperCase()}
                      </Tag>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="text-[11px] font-bold uppercase text-slate-400 tracking-wider mb-1.5">
                    Key Workflows & Controls
                  </div>
                  <ul className="text-xs text-slate-600 dark:text-slate-300 space-y-1">
                    {bp.features.map((f, i) => (
                      <li key={i} className="flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                        <span className="truncate">{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <Divider className="my-4" />

              <div className="pt-2">
                <Button
                  block
                  type={matchesCurrent ? 'default' : 'primary'}
                  disabled={matchesCurrent || !activeCompanyId}
                  onClick={() => promptApply(bp)}
                  icon={<Sparkles className="w-4 h-4" />}
                  className={matchesCurrent ? '' : 'bg-indigo-600 hover:bg-indigo-700'}
                >
                  {matchesCurrent ? 'Currently Applied' : 'Apply Industry Blueprint'}
                </Button>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Confirmation Modal */}
      <Modal
        title={
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-indigo-600" />
            <span>Apply Industry Blueprint: {targetBlueprint?.name}</span>
          </div>
        }
        open={confirmModalOpen}
        onCancel={() => setConfirmModalOpen(false)}
        footer={[
          <Button key="cancel" onClick={() => setConfirmModalOpen(false)}>
            Cancel
          </Button>,
          <Button
            key="apply"
            type="primary"
            loading={applying}
            onClick={handleApplyBlueprint}
            className="bg-indigo-600 hover:bg-indigo-700"
          >
            Confirm & Apply to {activeCompany?.name}
          </Button>,
        ]}
      >
        {targetBlueprint && activeCompany && (
          <div className="space-y-4 py-2 text-xs">
            <p className="text-slate-600 dark:text-slate-300">
              Applying this blueprint will automatically adjust the active module configuration for{' '}
              <strong>{activeCompany.name}</strong>. User permissions and navigation menus will immediately adapt.
            </p>

            <div className="p-3 bg-indigo-50/60 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-900 rounded-lg">
              <div className="font-bold text-indigo-900 dark:text-indigo-300 mb-1">
                Modules that will be ENABLED:
              </div>
              <div className="flex flex-wrap gap-1">
                {targetBlueprint.modules.map((m) => (
                  <Tag color="green" key={m}>
                    {m.toUpperCase()}
                  </Tag>
                ))}
              </div>
            </div>

            <div className="p-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg">
              <div className="font-bold text-slate-700 dark:text-slate-300 mb-1">
                Modules that will be DISABLED (if currently active):
              </div>
              <div className="flex flex-wrap gap-1">
                {ALL_MODULES.filter((m) => !targetBlueprint.modules.includes(m.key)).map((m) => (
                  <Tag color="default" key={m.key}>
                    {m.key.toUpperCase()}
                  </Tag>
                ))}
              </div>
            </div>

            <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>
                All historical journal entries, stock ledger records, and invoices remain intact in the database.
              </span>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

