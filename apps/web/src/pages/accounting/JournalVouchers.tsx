import { useState, useEffect } from 'react';
import { Table, Button, Card, Tag, Modal, Form, Input, DatePicker, Select, InputNumber, Space, Typography, Alert, message } from 'antd';
import { PlusOutlined, CheckCircleOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { api } from '../../api/client';
import { AmountDisplay } from '../../components/shared/AmountDisplay';

const { Title, Text } = Typography;

interface JournalLineInput {
  accountId: string;
  partyType?: 'supplier' | 'customer';
  partyId?: string;
  debitAmountRupees: number;
  creditAmountRupees: number;
  narration?: string;
}

interface CoaAccount {
  id: string;
  code: string;
  name: string;
  accountType: string;
}

interface JournalEntry {
  id: string;
  entryNumber: string;
  postingDate: string;
  documentType: string;
  documentNumber: string;
  narration: string | null;
  debitAmountPaise: number;
  creditAmountPaise: number;
  accountCode: string;
  accountName: string;
  lineNarration: string | null;
}

export function JournalVouchersPage() {
  const [loading, setLoading] = useState(false);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [coaAccounts, setCoaAccounts] = useState<CoaAccount[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const [form] = Form.useForm();
  const [lines, setLines] = useState<JournalLineInput[]>([
    { accountId: '', debitAmountRupees: 0, creditAmountRupees: 0, narration: '' },
    { accountId: '', debitAmountRupees: 0, creditAmountRupees: 0, narration: '' },
  ]);

  const fetchEntries = async () => {
    setLoading(true);
    try {
      const res = await api.get<JournalEntry[]>('/reports/general-ledger');
      setEntries(res.data);
    } catch {
      message.error('Failed to load journal entries');
    } finally {
      setLoading(false);
    }
  };

  const fetchCoa = async () => {
    try {
      const res = await api.get<{ accounts: CoaAccount[] }>('/settings/coa');
      if (res.data?.accounts) {
        setCoaAccounts(res.data.accounts);
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    fetchEntries();
    fetchCoa();
  }, []);

  const totalDebitPaise = lines.reduce((sum, l) => sum + Math.round((l.debitAmountRupees || 0) * 100), 0);
  const totalCreditPaise = lines.reduce((sum, l) => sum + Math.round((l.creditAmountRupees || 0) * 100), 0);
  const isBalanced = totalDebitPaise > 0 && totalDebitPaise === totalCreditPaise;

  const handleAddLine = () => {
    setLines([...lines, { accountId: '', debitAmountRupees: 0, creditAmountRupees: 0, narration: '' }]);
  };

  const handleLineChange = (index: number, field: keyof JournalLineInput, value: any) => {
    const next = [...lines];
    next[index] = { ...next[index], [field]: value };
    setLines(next);
  };

  const handleRemoveLine = (index: number) => {
    if (lines.length <= 2) {
      message.warning('A journal entry must have at least 2 lines');
      return;
    }
    setLines(lines.filter((_, i) => i !== index));
  };

  const handleCreateJv = async (values: any) => {
    if (!isBalanced) {
      message.error('Total Debit must equal Total Credit');
      return;
    }

    try {
      const payload = {
        postingDate: values.postingDate.format('YYYY-MM-DD'),
        narration: values.narration,
        lines: lines.map((l) => ({
          accountId: l.accountId,
          debitAmountPaise: Math.round((l.debitAmountRupees || 0) * 100),
          creditAmountPaise: Math.round((l.creditAmountRupees || 0) * 100),
          narration: l.narration,
        })),
      };

      await api.post('/accounting/jv', payload);
      message.success('Journal Voucher created successfully');
      setIsModalOpen(false);
      form.resetFields();
      setLines([
        { accountId: '', debitAmountRupees: 0, creditAmountRupees: 0, narration: '' },
        { accountId: '', debitAmountRupees: 0, creditAmountRupees: 0, narration: '' },
      ]);
      fetchEntries();
    } catch {
      message.error('Failed to post Journal Voucher');
    }
  };

  const columns = [
    {
      title: 'Posting Date',
      dataIndex: 'postingDate',
      key: 'postingDate',
      render: (val: string) => dayjs(val).format('DD MMM YYYY'),
    },
    {
      title: 'Entry / Doc #',
      dataIndex: 'entryNumber',
      key: 'entryNumber',
      render: (val: string, r: JournalEntry) => val || r.documentNumber || 'JV-MANUAL',
    },
    {
      title: 'Account',
      key: 'account',
      render: (_: any, r: JournalEntry) => (
        <span>
          <Tag color="blue" style={{ marginRight: 8 }}>{r.accountCode}</Tag>
          <Text strong>{r.accountName}</Text>
        </span>
      ),
    },
    {
      title: 'Debit (₹)',
      dataIndex: 'debitAmountPaise',
      key: 'debitAmountPaise',
      align: 'right' as const,
      render: (val: number) => <AmountDisplay paise={val} variant="debit" />,
    },
    {
      title: 'Credit (₹)',
      dataIndex: 'creditAmountPaise',
      key: 'creditAmountPaise',
      align: 'right' as const,
      render: (val: number) => <AmountDisplay paise={val} variant="credit" />,
    },
    {
      title: 'Narration',
      dataIndex: 'narration',
      key: 'narration',
      render: (val: string, r: JournalEntry) => val || r.lineNarration || '—',
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24, alignItems: 'center' }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>
            Journal Vouchers (JV)
          </Title>
          <Text type="secondary">Manual general ledger postings & double-entry adjustments</Text>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setIsModalOpen(true)}>
          New Journal Voucher
        </Button>
      </div>

      <Card>
        <Table
          rowKey="id"
          loading={loading}
          dataSource={entries}
          columns={columns}
          pagination={{ pageSize: 15 }}
        />
      </Card>

      <Modal
        title="Create Manual Journal Voucher"
        open={isModalOpen}
        onCancel={() => setIsModalOpen(false)}
        width={900}
        footer={null}
      >
        <Form form={form} layout="vertical" onFinish={handleCreateJv} initialValues={{ postingDate: dayjs() }}>
          <Space style={{ display: 'flex', gap: 16 }}>
            <Form.Item
              name="postingDate"
              label="Posting Date"
              rules={[{ required: true, message: 'Date required' }]}
              style={{ width: 220 }}
            >
              <DatePicker format="YYYY-MM-DD" style={{ width: '100%' }} />
            </Form.Item>

            <Form.Item name="narration" label="Header Narration" style={{ flex: 1 }}>
              <Input placeholder="Reason for manual journal entry" />
            </Form.Item>
          </Space>

          <Title level={5}>Journal Lines (Double-Entry)</Title>
          <Table
            pagination={false}
            dataSource={lines.map((l, idx) => ({ ...l, key: idx }))}
            columns={[
              {
                title: 'Account',
                key: 'account',
                width: 300,
                render: (_, __, idx) => (
                  <Select
                    showSearch
                    placeholder="Select Account"
                    value={lines[idx].accountId || undefined}
                    onChange={(val) => handleLineChange(idx, 'accountId', val)}
                    filterOption={(input, option) =>
                      ((option?.label ?? '') as string).toLowerCase().includes(input.toLowerCase())
                    }
                    options={coaAccounts.map((a) => ({
                      value: a.id,
                      label: `${a.code} — ${a.name} (${a.accountType})`,
                    }))}
                    style={{ width: '100%' }}
                  />
                ),
              },
              {
                title: 'Debit (₹)',
                key: 'debit',
                width: 150,
                render: (_, __, idx) => (
                  <InputNumber
                    min={0}
                    precision={2}
                    value={lines[idx].debitAmountRupees}
                    onChange={(val) => {
                      handleLineChange(idx, 'debitAmountRupees', val || 0);
                      if (val && val > 0) handleLineChange(idx, 'creditAmountRupees', 0);
                    }}
                    style={{ width: '100%' }}
                  />
                ),
              },
              {
                title: 'Credit (₹)',
                key: 'credit',
                width: 150,
                render: (_, __, idx) => (
                  <InputNumber
                    min={0}
                    precision={2}
                    value={lines[idx].creditAmountRupees}
                    onChange={(val) => {
                      handleLineChange(idx, 'creditAmountRupees', val || 0);
                      if (val && val > 0) handleLineChange(idx, 'debitAmountRupees', 0);
                    }}
                    style={{ width: '100%' }}
                  />
                ),
              },
              {
                title: 'Line Narration',
                key: 'lineNarration',
                render: (_, __, idx) => (
                  <Input
                    placeholder="Line note"
                    value={lines[idx].narration}
                    onChange={(e) => handleLineChange(idx, 'narration', e.target.value)}
                  />
                ),
              },
              {
                title: 'Action',
                key: 'action',
                width: 70,
                render: (_, __, idx) => (
                  <Button type="link" danger onClick={() => handleRemoveLine(idx)}>
                    Remove
                  </Button>
                ),
              },
            ]}
          />

          <Button type="dashed" onClick={handleAddLine} block icon={<PlusOutlined />} style={{ marginTop: 12 }}>
            Add Line
          </Button>

          <Card style={{ marginTop: 16, background: '#fafafa' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                {isBalanced ? (
                  <Tag color="success" icon={<CheckCircleOutlined />}>
                    Double-Entry Balanced
                  </Tag>
                ) : (
                  <Tag color="error" icon={<ExclamationCircleOutlined />}>
                    Unbalanced Entry
                  </Tag>
                )}
              </div>
              <Space size="large">
                <div>
                  <Text type="secondary">Total Debit: </Text>
                  <AmountDisplay paise={totalDebitPaise} variant="debit" bold />
                </div>
                <div>
                  <Text type="secondary">Total Credit: </Text>
                  <AmountDisplay paise={totalCreditPaise} variant="credit" bold />
                </div>
                <div>
                  <Text type="secondary">Difference: </Text>
                  <AmountDisplay paise={Math.abs(totalDebitPaise - totalCreditPaise)} variant="neutral" bold />
                </div>
              </Space>
            </div>
          </Card>

          {!isBalanced && (
            <Alert
              type="warning"
              message="Total debit must equal total credit before submitting."
              showIcon
              style={{ marginTop: 12 }}
            />
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 24 }}>
            <Button onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button type="primary" htmlType="submit" disabled={!isBalanced}>
              Post Journal Voucher
            </Button>
          </div>
        </Form>
      </Modal>
    </div>
  );
}
export default JournalVouchersPage;
