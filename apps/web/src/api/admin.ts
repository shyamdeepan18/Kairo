/**
 * Admin API client — for System Admin portal only.
 * All calls require the user to be isSystemAdmin = true.
 */

import { api } from './client';

export interface AdminCompany {
  id: string;
  name: string;
  legalName?: string;
  gstin?: string;
  baseCurrency: string;
  isActive: boolean;
  createdAt: string;
}

export interface AdminPlant {
  id: string;
  companyId: string;
  name: string;
  code: string;
  gstin?: string;
  city?: string;
  state?: string;
  isActive: boolean;
  userCount?: number;
}

export interface AdminUser {
  id: string;
  email: string;
  fullName: string;
  isActive: boolean;
  lastLoginAt?: string;
  roles: Array<{ roleId: string; roleName: string | null; plantId: string | null; plantName?: string | null; plantCode?: string | null }>;
}

export interface AdminRole {
  id: string;
  name: string;
  description?: string;
  isSystemRole: boolean;
  isActive: boolean;
}

export interface AdminLicense {
  id: string;
  companyId: string;
  edition: string;
  maxUsers: number;  // -1 = unlimited
  validFrom?: string;
  validTo?: string;
  installedAt: string;
  updatedAt: string;
}

export interface AdminPermission {
  id: string;
  code: string;
  module: string;
  documentType: string | null;
  action: string;
  label: string;
  description: string | null;
}

export interface AdminLicenseInfo {
  license: AdminLicense | null;
  activeUserCount: number;
  isOverLimit: boolean;
}

export const adminApi = {
  // Companies
  listCompanies: () =>
    api.get<{ companies: AdminCompany[]; total: number }>('/admin/companies').then((r) => r.data),
  createCompany: (data: Partial<AdminCompany> & { name: string }) =>
    api.post<{ company: AdminCompany }>('/admin/companies', data).then((r) => r.data),
  updateCompany: (id: string, data: Partial<AdminCompany>) =>
    api.patch<{ company: AdminCompany }>(`/admin/companies/${id}`, data).then((r) => r.data),
  toggleCompany: (id: string, isActive: boolean) =>
    api.patch<{ company: AdminCompany }>(`/admin/companies/${id}/toggle`, { isActive }).then((r) => r.data),

  // Plants
  listPlants: (companyId: string) =>
    api.get<{ plants: AdminPlant[]; total: number }>(`/admin/companies/${companyId}/plants`).then((r) => r.data),
  createPlant: (companyId: string, data: { name: string; code: string; gstin?: string; city?: string; state?: string; stateCode?: string }) =>
    api.post<{ plant: AdminPlant }>(`/admin/companies/${companyId}/plants`, data).then((r) => r.data),
  updatePlant: (companyId: string, plantId: string, data: Partial<AdminPlant>) =>
    api.patch<{ plant: AdminPlant }>(`/admin/companies/${companyId}/plants/${plantId}`, data).then((r) => r.data),

  // Users
  listUsers: (companyId: string) =>
    api.get<{ users: AdminUser[]; total: number }>(`/admin/companies/${companyId}/users`).then((r) => r.data),
  createUser: (companyId: string, data: { fullName: string; email: string; roleId: string; plantId?: string }) =>
    api.post<{ user: AdminUser; tempPassword: string; message: string }>(`/admin/companies/${companyId}/users`, data).then((r) => r.data),
  toggleUser: (userId: string, isActive: boolean) =>
    api.patch<{ user: AdminUser }>(`/admin/users/${userId}/toggle`, { isActive }).then((r) => r.data),
  resetUserPassword: (userId: string) =>
    api.post<{ tempPassword: string; message: string }>(`/admin/users/${userId}/reset-password`).then((r) => r.data),

  // Roles & Permissions
  listPermissions: () =>
    api.get<{ permissions: AdminPermission[]; total: number }>('/admin/permissions').then((r) => r.data),
  listRoles: (companyId: string) =>
    api.get<{ roles: AdminRole[]; total: number }>(`/admin/companies/${companyId}/roles`).then((r) => r.data),
  createRole: (companyId: string, data: { name: string; description?: string }) =>
    api.post<{ role: AdminRole }>(`/admin/companies/${companyId}/roles`, data).then((r) => r.data),
  updateRole: (companyId: string, roleId: string, data: { name: string; description?: string }) =>
    api.put<{ role: AdminRole }>(`/admin/companies/${companyId}/roles/${roleId}`, data).then((r) => r.data),
  deleteRole: (companyId: string, roleId: string) =>
    api.delete(`/admin/companies/${companyId}/roles/${roleId}`).then((r) => r.data),
  getRolePermissions: (companyId: string, roleId: string) =>
    api.get<{ permissionCodes: string[] }>(`/admin/companies/${companyId}/roles/${roleId}/permissions`).then((r) => r.data),
  updateRolePermissions: (companyId: string, roleId: string, permissionCodes: string[]) =>
    api.put<{ ok: boolean; grantedCount: number }>(`/admin/companies/${companyId}/roles/${roleId}/permissions`, { permissionCodes }).then((r) => r.data),
  assignRole: (companyId: string, userId: string, roleId: string, plantId?: string) =>
    api.post(`/admin/companies/${companyId}/users/${userId}/roles`, { roleId, plantId }).then((r) => r.data),
  updateUserRolePlant: (companyId: string, userId: string, roleId: string, plantId?: string | null) =>
    api.put(`/admin/companies/${companyId}/users/${userId}/roles/${roleId}`, { plantId }).then((r) => r.data),
  removeRole: (companyId: string, userId: string, roleId: string) =>
    api.delete(`/admin/companies/${companyId}/users/${userId}/roles/${roleId}`).then((r) => r.data),

  // License
  getLicense: (companyId: string) =>
    api.get<AdminLicenseInfo>(`/admin/companies/${companyId}/license`).then((r) => r.data),
  setLicense: (companyId: string, data: { edition: string; maxUsers: number; validFrom?: string; validTo?: string }) =>
    api.put<{ license: AdminLicense }>(`/admin/companies/${companyId}/license`, data).then((r) => r.data),
  revokeLicense: (companyId: string) =>
    api.delete(`/admin/companies/${companyId}/license`).then((r) => r.data),
};
