import React from 'react';
import { usePlantStore } from '../../store/plant';
import { InteractiveRoles } from '../admin/components/InteractiveRoles';

export function RolesPage() {
  const { company } = usePlantStore();

  if (!company?.id) {
    return <div className="p-8 text-slate-500">Please select a company first.</div>;
  }

  return (
    <div className="h-[calc(100vh-80px)] p-4 md:p-6 overflow-hidden">
      <InteractiveRoles companyId={company.id} />
    </div>
  );
}
