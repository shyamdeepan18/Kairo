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
    if (!company.hasLicense) {
      setError(`Company '${company.name}' does not have an active license. Please contact your system administrator.`);
      return;
    }
    if (company.licenseValidTo && new Date(company.licenseValidTo) < new Date()) {
      setError(`The license for '${company.name}' expired on ${new Date(company.licenseValidTo).toLocaleDateString()}. Please renew the license.`);
      return;
    }

    setSelectedCompany(company);
    setCompany(company);
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

  const cardHoverStyle = {
    cursor: 'pointer',
    border: `1px solid ${dt.colorBorderSecondary}`,
    borderRadius: 12,
    transition: 'all 0.15s ease',
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: isDark
          ? '#191C24'
          : 'linear-gradient(135deg, #EEF2FF 0%, #F4F6FB 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-start',
        padding: '48px 24px',
      }}
    >
      {/* Header */}
      <div
        style={{
          width: '100%',
          maxWidth: 680,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 40,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: 'linear-gradient(135deg, #4F46E5, #818CF8)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontWeight: 700,
              fontSize: 16,
            }}
          >
            E
          </div>
          <Text strong style={{ fontSize: 16 }}>
            KAIRO ERP
          </Text>
        </div>
        <Button
          type="text"
          icon={<LogoutOutlined />}
          onClick={handleLogout}
          style={{ color: dt.colorTextSecondary }}
        >
          Sign out
        </Button>
      </div>

      {/* Content card */}
      <div
        style={{
          width: '100%',
          maxWidth: 680,
          background: dt.colorBgContainer,
          borderRadius: 16,
          border: `1px solid ${dt.colorBorderSecondary}`,
          boxShadow: isDark
            ? '0 8px 32px rgba(0,0,0,0.4)'
            : '0 8px 32px rgba(15,23,42,0.08)',
          overflow: 'hidden',
        }}
      >
        {/* Top accent */}
        <div style={{ height: 4, background: 'linear-gradient(90deg, #4F46E5, #818CF8)' }} />

        <div style={{ padding: '32px 32px 36px' }}>
          {/* Step header */}
          <div style={{ marginBottom: 24 }}>
            {step === 'plant' && (
              <Button
                type="text"
                icon={<ArrowLeftOutlined />}
                onClick={handleBack}
                style={{ color: dt.colorTextSecondary, padding: '0 0 12px 0', display: 'block' }}
              >
                Back
              </Button>
            )}
            <Title level={4} style={{ margin: 0, fontWeight: 700 }}>
              {step === 'company' ? 'Select Company' : `Select Plant — ${selectedCompany?.name}`}
            </Title>
            <Text type="secondary" style={{ fontSize: 13 }}>
              {step === 'company'
                ? 'Choose the company you want to work in'
                : 'Choose which plant / location to open'}
            </Text>
          </div>

          {/* Error */}
          {error && (
            <Alert
              message={error}
              type="error"
              showIcon
              closable
              onClose={() => setError(null)}
              style={{ marginBottom: 20, borderRadius: 8 }}
            />
          )}

          {/* Loading */}
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px 0' }}>
              <Spin size="large" />
            </div>
          ) : step === 'company' ? (
            /* Company list */
            companies.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: dt.colorTextSecondary }}>
                <BankOutlined style={{ fontSize: 40, marginBottom: 12, opacity: 0.4 }} />
                <div>No companies found. Ask your administrator to assign you a role.</div>
              </div>
            ) : (
              <Row gutter={[12, 12]}>
                {companies.map((co) => (
                  <Col xs={24} sm={12} key={co.id}>
                    <Card
                      hoverable={co.hasLicense && (!co.licenseValidTo || new Date(co.licenseValidTo) >= new Date())}
                      style={{
                        ...cardHoverStyle,
                        opacity: co.hasLicense && (!co.licenseValidTo || new Date(co.licenseValidTo) >= new Date()) ? 1 : 0.6,
                      }}
                      styles={{ body: { padding: '16px 20px' } }}
                      onClick={() => handleSelectCompany(co)}
                    >
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                        <div
                          style={{
                            width: 40,
                            height: 40,
                            borderRadius: 10,
                            background: isDark ? 'rgba(129,140,248,0.12)' : '#EEF2FF',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                          }}
                        >
                          <BankOutlined
                            style={{
                              fontSize: 18,
                              color: isDark ? '#818CF8' : '#4F46E5',
                            }}
                          />
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <Text strong style={{ display: 'block', fontSize: 14 }}>
                            {co.name}
                          </Text>
                          {co.gstin && (
                            <Text type="secondary" style={{ fontSize: 12 }}>
                              GSTIN: {co.gstin}
                            </Text>
                          )}
                          <div style={{ marginTop: 4 }}>
                            <Badge
                              color={isDark ? '#4ADE80' : '#15803D'}
                              text={
                                <Text style={{ fontSize: 11, color: dt.colorTextTertiary }}>
                                  {co.baseCurrency}
                                </Text>
                              }
                            />
                            {!co.hasLicense ? (
                              <Tag color="error" style={{ marginLeft: 8, fontSize: 10, borderRadius: 10, border: 0 }}>No License</Tag>
                            ) : co.licenseValidTo && new Date(co.licenseValidTo) < new Date() ? (
                              <Tag color="warning" style={{ marginLeft: 8, fontSize: 10, borderRadius: 10, border: 0 }}>Expired</Tag>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </Card>
                  </Col>
                ))}
              </Row>
            )
          ) : (
            /* Plant list */
            <Row gutter={[12, 12]}>
              {plants.map((plant) => (
                <Col xs={24} sm={12} key={plant.id}>
                  <Card
                    hoverable
                    style={cardHoverStyle}
                    styles={{ body: { padding: '16px 20px' } }}
                    onClick={() => handleSelectPlant(plant)}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                      <div
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: 10,
                          background: isDark ? 'rgba(96,165,250,0.12)' : '#EFF6FF',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        <EnvironmentOutlined
                          style={{
                            fontSize: 18,
                            color: isDark ? '#60A5FA' : '#1D4ED8',
                          }}
                        />
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <Text strong style={{ display: 'block', fontSize: 14 }}>
                          {plant.name}
                        </Text>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          Code: {plant.code}
                        </Text>
                        {plant.gstin && (
                          <Text
                            type="secondary"
                            style={{ display: 'block', fontSize: 11 }}
                          >
                            GSTIN: {plant.gstin}
                          </Text>
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
