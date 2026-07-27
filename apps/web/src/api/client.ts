import axios from 'axios';
import type { AuthUser } from '@erp/shared';

/**
 * Single axios instance for the entire app.
 * - Automatically attaches Authorization header from auth store.
 * - On 401, silently tries to refresh once via the httpOnly cookie.
 * - If refresh fails, clears auth state and redirects to /login.
 *
 * Import this everywhere instead of raw axios.
 */
export const api = axios.create({
  baseURL: '/api',
  withCredentials: true, // sends the httpOnly refresh_token cookie
  headers: { 'Content-Type': 'application/json' },
});

import { useAuthStore } from '../store/auth';

// ── Request interceptor: attach access token ─────────────────────────────
// Tenant context (company + plant) is bound to the JWT server-side via
// POST /auth/select-context and read from request.user — the client no longer
// sends x-company-id / x-plant-id headers (the server would ignore them anyway).
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ── Response interceptor: refresh on 401 ─────────────────────────────────
let isRefreshing = false;
let waitQueue: Array<{ resolve: (t: string) => void; reject: (e: unknown) => void }> = [];

const drainQueue = (err: unknown, token: string | null) =>
  waitQueue.splice(0).forEach((p) => (err ? p.reject(err) : p.resolve(token!)));

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;

    if (error.response?.status === 409 && error.response?.data?.error === 'tenant_context_required') {
      if (window.location.pathname !== '/select-company') {
        window.location.href = '/select-company';
      }
      return Promise.reject(error);
    }

    const shouldRetry =
      error.response?.status === 401 &&
      !original._retry &&
      !original.url?.endsWith('/auth/refresh') &&
      !original.url?.endsWith('/auth/login');

    if (!shouldRetry) return Promise.reject(error);

    if (isRefreshing) {
      // Queue this request — it will be retried once a refresh completes
      return new Promise<string>((resolve, reject) => {
        waitQueue.push({ resolve, reject });
      }).then((token) => {
        original.headers.Authorization = `Bearer ${token}`;
        return api(original);
      });
    }

    original._retry = true;
    isRefreshing = true;

    try {
      const res = await api.post<{ accessToken: string; user: AuthUser }>('/auth/refresh');
      const { accessToken, user } = res.data;

      useAuthStore.getState().setAuth(user, accessToken);

      drainQueue(null, accessToken);
      original.headers.Authorization = `Bearer ${accessToken}`;
      return api(original);
    } catch (refreshErr) {
      drainQueue(refreshErr, null);
      useAuthStore.getState().clearAuth();
      window.location.href = '/login';
      return Promise.reject(refreshErr);
    } finally {
      isRefreshing = false;
    }
  }
);
