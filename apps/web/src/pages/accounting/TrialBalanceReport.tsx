import { useState, useEffect } from 'react';
import { Table, Card, Typography, Space, Button, Input, Tag, Alert, Row, Col, Statistic } from 'antd';
import { SearchOutlined, DownloadOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { api } from '../../api/client';
import { AmountDisplay } from '../../components/shared/AmountDisplay';

const { Title, Text } = Typography;

interface CoaAccount {
  id: string;
  code: string;
  name: string;
  accountType: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
}

interface GeneralLedgerLine {
  id: string;
  accountCode: string;
  accountName: string;
  debitAmountPaise: number;
  creditAmountPaise: number;
}

interface TrialBalanceRow {
  key: string;
  code: string;
  name: string;
  accountType: string;
  totalDebitPaise: number;
  totalCreditPaise: number;
  netDebitPaise: number;
  netCreditPaise: number;
}

export function TrialBalanceReportPage() {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<TrialBalanceRow[]>([]);
  const [search, setSearch] = useState('');

  const fetchTrialBalance = async () => {
    setLoading(true);
    try {
      const [coaRes, glRes] = await Promise.all([
        api.get<{ accounts: CoaAccount[] }>('/settings/coa'),
        api.get<GeneralLedgerLine[]>('/reports/general-ledger'),
      ]);

      const accounts = coaRes.data?.accounts || [];
      const ledger = glRes.data || [];

      // Group debits and credits by account
      const totalsMap: Record<string, { debit: number; credit: number; code: string; name: string; type: string }> = {};

      accounts.forEach((acc) => {
        totalsMap[acc.code] = {
          debit: 0,
          credit: 0,
          code: acc.code,
          name: acc.name,
          type: acc.accountType,
        };
      });

      ledger.forEach((line) => {
        if (!totalsMap[line.accountCode]) {
          totalsMap[line.accountCode] = {
            debit: 0,
            credit: 0,
            code: line.accountCode,
            name: line.accountName,
            type: 'asset',
          };
        }
        totalsMap[line.accountCode].debit += line.debitAmountPaise || 0;
        totalsMap[line.accountCode].credit += line.creditAmountPaise || 0;
      });

      const parsedRows: TrialBalanceRow[] = Object.values(totalsMap)
        .filter((acc) => acc.debit > 0 || acc.credit > 0)
        .map((acc) => {
          const diff = acc.debit - acc.credit;
          return {
            key: acc.code,
            code: acc.code,
            name: acc.name,
            accountType: acc.type,
            totalDebitPaise: acc.debit,
            totalCreditPaise: acc.credit,
            netDebitPaise: diff > 0 ? diff : 0,
            netCreditPaise: diff < 0 ? Math.abs(diff) : 0,
          };
        })
        .sort((a, b) => a.code.localeCompare(b.code));

      setRows(parsedRows);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTrialBalance();
  }, []);

  const filteredRows = rows.filter(
    (r) =>
      r.code.toLowerCase().includes(search.toLowerCase()) ||
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      r.accountType.toLowerCase().includes(search.toLowerCase())
  );

  const grandTotalDebitPaise = rows.reduce((sum, r) => sum + r.totalDebitPaise, 0);
  const grandTotalCreditPaise = rows.reduce((sum, r) => sum + r.totalCreditPaise, 0);
  const isTrialBalanceInSync = grandTotalDebitPaise === grandTotalCreditPaise;

  const handleExportCsv = () => {
    const headers = ['Account Code', 'Account Name', 'Account Type', 'Total Debit (₹)', 'Total Credit (₹)', 'Net Debit (₹)', 'Net Credit (₹)'];
    const csvLines = [headers.join(',')];

    rows.forEach((r) => {
      csvLines.push(
        [
          `"${r.code}"`,
          `"${r.name}"`,
          `"${r.accountType}"`,
          (r.totalDebitPaise / 100).toFixed(2),
          (r.totalCreditPaise / 100).toFixed(2),
          (r.netDebitPaise / 100).toFixed(2),
          (r.netCreditPaise / 100).toFixed(2),
        ].join(',')
      );
    });

    const blob = new Blob([csvLines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trial_balance_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  const columns = [
    {
      title: 'Account Code',
      dataIndex: 'code',
      key: 'code',
      render: (code: string) => <Tag color="blue">{code}</Tag>,
    },
    {
      title: 'Account Name',
      dataIndex: 'name',
      key: 'name',
      render: (name: string) => <Text strong>{name}</Text>,
    },
    {
      title: 'Category',
      dataIndex: 'accountType',
      key: 'accountType',
      render: (type: string) => <Tag style={{ textTransform: 'capitalize' }}>{type}</Tag>,
    },
    {
      title: 'Total Debit (₹)',
      dataIndex: 'totalDebitPaise',
      key: 'totalDebitPaise',
      align: 'right' as const,
      render: (val: number) => <AmountDisplay paise={val} variant="debit" />,
    },
    {
      title: 'Total Credit (₹)',
      dataIndex: 'totalCreditPaise',
      key: 'totalCreditPaise',
      align: 'right' as const,
      render: (val: number) => <AmountDisplay paise={val} variant="credit" />,
    },
    {
      title: 'Net Debit (₹)',
      dataIndex: 'netDebitPaise',
      key: 'netDebitPaise',
      align: 'right' as const,
      render: (val: number) => (val > 0 ? <AmountDisplay paise={val} variant="debit" bold /> : '—'),
    },
    {
      title: 'Net Credit (₹)',
      dataIndex: 'netCreditPaise',
      key: 'netCreditPaise',
      align: 'right' as const,
      render: (val: number) => (val > 0 ? <AmountDisplay paise={val} variant="credit" bold /> : '—'),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24, alignItems: 'center' }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>
            Trial Balance
          </Title>
          <Text type="secondary">Summary of all ledger debits and credits for double-entry verification</Text>
        </div>
        <Button icon={<DownloadOutlined />} onClick={handleExportCsv}>
          Export CSV
        </Button>
      </div>

      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={8}>
          <Card>
            <Statistic
              title="Total Debits"
              value={grandTotalDebitPaise / 100}
              precision={2}
              prefix="₹"
              valueStyle={{ color: '#15803D' }}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic
              title="Total Credits"
              value={grandTotalCreditPaise / 100}
              precision={2}
              prefix="₹"
              valueStyle={{ color: '#B91C1C' }}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic
              title="Trial Balance State"
              value={isTrialBalanceInSync ? 'In Balance' : 'Out of Balance'}
              valueStyle={{ color: isTrialBalanceInSync ? '#15803D' : '#B91C1C' }}
              prefix={isTrialBalanceInSync ? <CheckCircleOutlined /> : undefined}
            />
          </Card>
        </Col>
      </Row>

      <Card style={{ marginBottom: 16 }}>
        <Input
          placeholder="Filter by account code or name..."
          prefix={<SearchOutlined />}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: 320 }}
        />
      </Card>

      <Card>
        <Table
          rowKey="key"
          loading={loading}
          dataSource={filteredRows}
          columns={columns}
          pagination={false}
          summary={() => (
            <Table.Summary fixed>
              <Table.Summary.Row style={{ background: '#fafafa', fontWeight: 'bold' }}>
                <Table.Summary.Cell index={0} colSpan={3}>
                  <Text strong>Grand Total</Text>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={1} align="right">
                  <AmountDisplay paise={grandTotalDebitPaise} variant="debit" bold />
                </Table.Summary.Cell>
                <Table.Summary.Cell index={2} align="right">
                  <AmountDisplay paise={grandTotalCreditPaise} variant="credit" bold />
                </Table.Summary.Cell>
                <Table.Summary.Cell index={3} align="right">
                  <AmountDisplay
                    paise={rows.reduce((sum, r) => sum + r.netDebitPaise, 0)}
                    variant="debit"
                    bold
                  />
                </Table.Summary.Cell>
                <Table.Summary.Cell index={4} align="right">
                  <AmountDisplay
                    paise={rows.reduce((sum, r) => sum + r.netCreditPaise, 0)}
                    variant="credit"
                    bold
                  />
                </Table.Summary.Cell>
              </Table.Summary.Row>
            </Table.Summary>
          )}
        />
      </Card>

      {!isTrialBalanceInSync && (
        <Alert
          type="error"
          message="Trial Balance Discrepancy"
          description="Total Debits do not match Total Credits. Please review recent manual Journal Vouchers."
          showIcon
          style={{ marginTop: 16 }}
        />
      )}
    </div>
  );
}
export default TrialBalanceReportPage;
