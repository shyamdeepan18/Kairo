import { useState } from 'react';
import { Modal, Form, Input, message } from 'antd';
import { LockOutlined } from '@ant-design/icons';
import { authApi } from '../api/auth';

interface ChangePasswordModalProps {
  open: boolean;
  onClose: () => void;
}

export function ChangePasswordModal({ open, onClose }: ChangePasswordModalProps) {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (values: any) => {
    if (values.newPassword !== values.confirmPassword) {
      message.error('New passwords do not match');
      return;
    }

    setLoading(true);
    try {
      await authApi.changePassword(values.currentPassword, values.newPassword);
      message.success('Password changed successfully');
      form.resetFields();
      onClose();
    } catch (err: any) {
      message.error(err?.response?.data?.error ?? 'Failed to change password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title="Change Password"
      open={open}
      onCancel={() => { form.resetFields(); onClose(); }}
      onOk={() => form.submit()}
      confirmLoading={loading}
      okText="Update Password"
      destroyOnClose
    >
      <Form form={form} layout="vertical" onFinish={handleSubmit} requiredMark={false}>
        <Form.Item
          name="currentPassword"
          label="Current / Temporary Password"
          rules={[{ required: true, message: 'Please enter your current or temporary password' }]}
        >
          <Input.Password prefix={<LockOutlined />} placeholder="Enter current or temporary password" />
        </Form.Item>

        <Form.Item
          name="newPassword"
          label="New Password"
          rules={[
            { required: true, message: 'Please enter a new password' },
            { min: 6, message: 'Password must be at least 6 characters long' }
          ]}
        >
          <Input.Password prefix={<LockOutlined />} placeholder="Enter new password (min 6 chars)" />
        </Form.Item>

        <Form.Item
          name="confirmPassword"
          label="Confirm New Password"
          dependencies={['newPassword']}
          rules={[
            { required: true, message: 'Please confirm your new password' },
            ({ getFieldValue }) => ({
              validator(_, value) {
                if (!value || getFieldValue('newPassword') === value) {
                  return Promise.resolve();
                }
                return Promise.reject(new Error('Passwords do not match'));
              },
            }),
          ]}
        >
          <Input.Password prefix={<LockOutlined />} placeholder="Confirm new password" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
