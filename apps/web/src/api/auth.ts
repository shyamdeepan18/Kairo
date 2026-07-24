import { api } from './client';
import type { LoginResponse, RefreshResponse, AuthUser } from '@erp/shared';

export const authApi = {
  login: (email: string, password: string) =>
    api.post<LoginResponse>('/auth/login', { email, password }).then((r) => r.data),

  logout: () =>
    api.post('/auth/logout').then((r) => r.data),

  refresh: () =>
    api.post<RefreshResponse>('/auth/refresh').then((r) => r.data),

  me: () =>
    api.get<{ user: AuthUser }>('/auth/me').then((r) => r.data.user),

  changePassword: (currentPassword: string, newPassword: string) =>
    api.post<{ message: string }>('/auth/change-password', { currentPassword, newPassword }).then((r) => r.data),

  getPermissions: (companyId?: string, plantId?: string) =>
    api.get<{ permissions: string[] }>('/auth/permissions', { params: { companyId, plantId } }).then((r) => r.data.permissions),
};
