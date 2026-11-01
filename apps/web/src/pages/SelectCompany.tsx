import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Typography, Card, Button, Spin, Alert, Row, Col, Badge, Tag, theme as antTheme,
} from 'antd';
import {
  BankOutlined,
  EnvironmentOutlined,
  ArrowLeftOutlined,
  LogoutOutlined,
} from '@ant-design/icons';
import { useAuthStore } from '../store/auth';
import { useThemeStore } from '../store/theme';
import { usePlantStore, type ErpCompany, type ErpPlant } from '../store/plant';
import { useWorkspaceStore } from '../store/workspace';
import { authApi } from '../api/auth';
import { companiesApi } from '../api/companies';

const { Title, Text } = Typography;

type Step = 'company' | 'plant';

export function SelectCompanyPage() {
  const navigate = useNavigate();
  const { logout, user, setAuth } = useAuthStore((s) => ({
    logout: s.logout,
    user: s.user,
    setAuth: s.setAuth,
  }));
  const { isDark } = useThemeStore();
  const { token: dt } = antTheme.useToken();
  const { setCompany, setPlant } = usePlantStore();

  const [step, setStep] = useState<Step>('company');
  const [companies, setCompanies] = useState<ErpCompany[]>([]);
  const [plants, setPlants] = useState<ErpPlant[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<ErpCompany | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load companies on mount
  useEffect(() => {
    setLoading(true);
    companiesApi
      .list()
      .then(setCompanies)
      .catch((err) => {
        const msg = err?.response?.data?.error ?? 'Failed to load companies.';
        setError(msg);
      })
      .finally(() => setLoading(false));
  }, []);

  const handleSelectCompany = async (company: ErpCompany) => {
    const isSystemAdmin = user?.isSystemAdmin;
    if (!isSystemAdmin) {
      if (!company.hasLicense) {
        setError(`Company '${company.name}' does not have an active license. Please contact your system administrator.`);
        return;
      }
      if (company.licenseValidTo && new Date(company.licenseValidTo) < new Date()) {
        setError(`The license for '${company.name}' expired on ${new Date(company.licenseValidTo).toLocaleDateString()}. Please renew the license.`);
        return;
      }
    }

    setSelectedCompany(company);
    setCompany(company);
    useWorkspaceStore.getState().closeAll();
    setLoading(true);
    setError(null);
    try {
      const { accessToken } = await authApi.selectContext(company.id, null);
      if (user) setAuth(user, accessToken);

      const list = await companiesApi.listPlants(company.id);
      setPlants(list);

      // If only one plant, skip selection and go straight to dashboard
      if (list.length === 1) {
        const { accessToken: plantToken } = await authApi.selectContext(company.id, list[0].id);
        if (user) setAuth(user, plantToken);
        setPlant(list[0]);
        navigate('/dashboard', { replace: true });
        return;
      }

      setStep('plant');
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? 'Failed to select company.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectPlant = async (plant: ErpPlant) => {
    if (selectedCompany) {
      try {
        setLoading(true);
        const { accessToken } = await authApi.selectContext(selectedCompany.id, plant.id);
        if (user) setAuth(user, accessToken);
        useWorkspaceStore.getState().closeAll();
        setPlant(plant);
        navigate('/dashboard', { replace: true });
      } catch (err: any) {
        const msg = err?.response?.data?.error ?? 'Failed to select plant.';
        setError(msg);
      } finally {
        setLoading(false);
      }
    }
  };

  const handleBack = () => {
    setStep('company');
    setSelectedCompany(null);
    setPlants([]);
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className={`min-h-screen flex flex-col items-center justify-start pt-12 px-6 pb-6 transition-colors duration-300 ${isDark ? 'bg-[#191C24]' : 'bg-gradient-to-br from-indigo-50 via-sky-50 to-slate-50'}`}>
      {/* Header */}
      <div className="w-full max-w-[680px] flex items-center justify-between mb-10">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-600 to-indigo-400 flex items-center justify-center text-white font-bold text-base shadow-sm">
            E
          </div>
          <span className="font-bold text-base text-slate-900 dark:text-white">
            KAIRO ERP
          </span>
        </div>
        <div className="flex items-center gap-3">
          {user?.isSystemAdmin && (
            <Button
              type="primary"
              onClick={() => navigate('/admin', { replace: true })}
            >
              Go to Admin Portal
            </Button>
          )}
          <Button
            type="text"
            icon={<LogoutOutlined />}
            onClick={handleLogout}
            className="text-slate-500 dark:text-slate-400"
          >
            Sign out
          </Button>
        </div>
      </div>

      {/* Content card */}
      <div className="w-full max-w-[680px] bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-[0_8px_32px_rgba(15,23,42,0.08)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.4)] overflow-hidden">
        {/* Top accent */}
        <div className="h-1 bg-gradient-to-r from-indigo-600 to-indigo-400" />

        <div className="p-8 pb-9">
          {/* Step header */}
          <div className="mb-6">
            {step === 'plant' && (
              <Button
                type="text"
                icon={<ArrowLeftOutlined />}
                onClick={handleBack}
                className="text-slate-500 dark:text-slate-400 pb-3 block"
              >
                Back
              </Button>
            )}
            <h2 className="m-0 font-bold text-lg text-slate-900 dark:text-white">
              {step === 'company' ? 'Select Company' : `Select Plant — ${selectedCompany?.name}`}
            </h2>
            <p className="text-[13px] text-slate-500 dark:text-slate-400 mt-1 mb-0">
              {step === 'company'
                ? 'Choose the company you want to work in'
                : 'Choose which plant / location to open'}
            </p>
          </div>

          {/* Error */}
          {error && (
            <Alert
              message={error}
              type="error"
              showIcon
              closable
              onClose={() => setError(null)}
              className="mb-5 rounded-lg"
            />
          )}

          {/* Loading */}
          {loading ? (
            <div className="text-center py-10">
              <Spin size="large" />
            </div>
          ) : step === 'company' ? (
            /* Company list */
            companies.length === 0 ? (
              <div className="text-center py-10 text-slate-500 dark:text-slate-400">
                <BankOutlined className="text-[40px] mb-3 opacity-40" />
                <div>No companies found. Ask your administrator to assign you a role.</div>
              </div>
            ) : (
              <Row gutter={[12, 12]}>
                {companies.map((co) => {
                  const hasValidLicense = co.hasLicense && (!co.licenseValidTo || new Date(co.licenseValidTo) >= new Date());
                  return (
                    <Col xs={24} sm={12} key={co.id}>
                      <Card
                        hoverable={hasValidLicense}
                        className={`cursor-pointer border border-slate-200 dark:border-slate-700 rounded-xl transition-all duration-150 ${hasValidLicense ? 'opacity-100 hover:border-indigo-400 dark:hover:border-indigo-500 hover:shadow-sm' : 'opacity-60 cursor-not-allowed bg-slate-50 dark:bg-slate-900'}`}
                        styles={{ body: { padding: '16px 20px' } }}
                        onClick={() => handleSelectCompany(co)}
                      >
                        <div className="flex items-start gap-3">
                          <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center shrink-0">
                            <BankOutlined className="text-[18px] text-indigo-600 dark:text-indigo-400" />
                          </div>
                          <div className="min-w-0">
                            <span className="block font-bold text-[14px] text-slate-900 dark:text-white">
                              {co.name}
                            </span>
                            {co.gstin && (
                              <span className="text-[12px] text-slate-500 dark:text-slate-400 block mt-0.5">
                                GSTIN: {co.gstin}
                              </span>
                            )}
                            <div className="mt-1 flex items-center">
                              <Badge
                                color={isDark ? '#4ADE80' : '#15803D'}
                                text={
                                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                                    {co.baseCurrency}
                                  </span>
                                }
                              />
                              {!co.hasLicense ? (
                                <Tag color="error" className="ml-2 text-[10px] rounded-full border-0">No License</Tag>
                              ) : co.licenseValidTo && new Date(co.licenseValidTo) < new Date() ? (
                                <Tag color="warning" className="ml-2 text-[10px] rounded-full border-0">Expired</Tag>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </Card>
                    </Col>
                  );
                })}
              </Row>
            )
          ) : (
            /* Plant list */
            <Row gutter={[12, 12]}>
              {plants.map((plant) => (
                <Col xs={24} sm={12} key={plant.id}>
                  <Card
                    hoverable
                    className="cursor-pointer border border-slate-200 dark:border-slate-700 rounded-xl transition-all duration-150 hover:border-indigo-400 dark:hover:border-indigo-500 hover:shadow-sm"
                    styles={{ body: { padding: '16px 20px' } }}
                    onClick={() => handleSelectPlant(plant)}
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                        <EnvironmentOutlined className="text-[18px] text-blue-600 dark:text-blue-400" />
                      </div>
                      <div className="min-w-0">
                        <span className="block font-bold text-[14px] text-slate-900 dark:text-white">
                          {plant.name}
                        </span>
                        <span className="text-[12px] text-slate-500 dark:text-slate-400 block mt-0.5">
                          Code: {plant.code}
                        </span>
                        {plant.gstin && (
                          <span className="block text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                            GSTIN: {plant.gstin}
                          </span>
                        )}
                      </div>
                    </div>
                  </Card>
                </Col>
              ))}
            </Row>
          )}
        </div>
      </div>
    </div>
  );
}
