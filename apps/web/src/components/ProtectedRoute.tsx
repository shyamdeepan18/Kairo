import { Navigate, Outlet } from 'react-router-dom';
import { Spin } from 'antd';
import { useAuthStore, selectIsAuthenticated } from '../store/auth';
import { usePlantStore } from '../store/plant';

/**
 * ProtectedRoute — gates all authenticated routes.
 *
 * Flow:
 *  1. Wait for session to be restored (initialize() running)
 *  2. Redirect to /login if not authenticated
 *  3. Redirect to /select-company if no plant is selected
 */
export function ProtectedRoute() {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const isInitialized = useAuthStore((s) => s.isInitialized);

  if (!isInitialized) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100vh',
        }}
      >
        <Spin size="large" />
      </div>
    );
  }

  return isAuthenticated ? <Outlet /> : <Navigate to="/login" replace />;
}

/**
 * PlantRoute — nested inside ProtectedRoute.
 * Ensures a company + plant are selected before showing the main app shell.
 */
export function PlantRoute() {
  const plant = usePlantStore((s) => s.plant);
  return plant ? <Outlet /> : <Navigate to="/select-company" replace />;
}
