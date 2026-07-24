import { create } from 'zustand';
import { authApi } from '../api/auth';

interface PermissionState {
  permissions: string[];
  isLoading: boolean;

  fetchPermissions: (companyId?: string, plantId?: string) => Promise<void>;
  hasPermission: (permissionCode: string) => boolean;
  hasAnyPermission: (permissionCodes: string[]) => boolean;
}

export const usePermissionStore = create<PermissionState>((set, get) => ({
  permissions: [],
  isLoading: false,

  fetchPermissions: async (companyId?: string, plantId?: string) => {
    set({ isLoading: true });
    try {
      const perms = await authApi.getPermissions(companyId, plantId);
      set({ permissions: perms, isLoading: false });
    } catch {
      set({ permissions: [], isLoading: false });
    }
  },

  hasPermission: (code: string) => {
    const list = get().permissions;
    if (list.includes('*')) return true; // System Admin / Wildcard
    return list.includes(code);
  },

  hasAnyPermission: (codes: string[]) => {
    const list = get().permissions;
    if (list.includes('*')) return true;
    return codes.some((code) => list.includes(code));
  },
}));
