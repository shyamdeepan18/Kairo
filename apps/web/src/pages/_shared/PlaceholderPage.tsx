import { Result } from 'antd';

export function PlaceholderPage({ title, moduleName }: { title: string; moduleName: string }) {
  return (
    <Result
      status="info"
      title={title}
      subTitle={`This page belongs to the ${moduleName} module and is scheduled for a future frontend iteration. The underlying backend logic (stock ledger, GL posting) is already fully operational.`}
    />
  );
}
