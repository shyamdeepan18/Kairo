import { create } from 'zustand';
import type { AuthUser } from '@erp/shared';
import { authApi } from '../api/auth';
import { usePlantStore } from './plant';
import { useWorkspaceStore } from './workspace';
import { usePermissionStore } from './permission';

export function resetAllStores() {
  try {
    usePlantStore.getState().clear();
    useWorkspaceStore.getState().closeAll();
    usePermissionStore.setState({ permissions: [], isLoading: false });
    sessionStorage.removeItem('erp-plant');
    sessionStorage.clear();
    localStorage.removeItem('erp-plant');
  } catch {
    // ignore in environments without storage
  }
}

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  isInitialized: boolean;   // true once we've tried to restore session on mount

  // Actions
  setAuth: (user: AuthUser, token: string) => void;
  clearAuth: () => void;
  initialize: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  accessToken: null,
  isInitialized: false,

  setAuth: (user, accessToken) => set({ user, accessToken }),

  clearAuth: () => {
    resetAllStores();
    set({ user: null, accessToken: null });
  },

  /**
   * Called once on app mount.
   * Tries to get a new access token using the httpOnly refresh cookie.
   * If the cookie is valid, we restore the session silently.
   * If not (no cookie, expired, revoked), user stays logged out.
   */
  initialize: async () => {
    try {
      const { accessToken, user } = await authApi.refresh();
      set({ user, accessToken, isInitialized: true });
    } catch {
      resetAllStores();
      set({ user: null, accessToken: null, isInitialized: true });
    }
  },

  login: async (email, password) => {
    // Purge any residual company/plant/tab data from a previous session
    resetAllStores();
    const { accessToken, user } = await authApi.login(email, password);
    set({ user, accessToken });
  },

  logout: async () => {
    try { await authApi.logout(); } catch { /* ignore — clear state regardless */ }
    resetAllStores();
    set({ user: null, accessToken: null });
  },
}));

// Convenience selector
export const selectUser = (s: AuthState) => s.user;
export const selectIsAuthenticated = (s: AuthState) => s.user !== null && s.accessToken !== null;
