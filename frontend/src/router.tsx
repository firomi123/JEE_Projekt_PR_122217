import { createBrowserRouter } from 'react-router';
import { GuestOnly, RequireAuth } from './auth/RequireAuth';
import { AppLayout, AuthLayout } from './layout/AppLayout';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { RegisterPage } from './pages/RegisterPage';

/**
 * Application routes (Polish URLs):
 * - `/logowanie`, `/rejestracja` – only for logged-out users,
 * - everything else – only for logged-in users, inside the main layout.
 */
export const router = createBrowserRouter([
  {
    element: (
      <GuestOnly>
        <AuthLayout />
      </GuestOnly>
    ),
    children: [
      { path: '/logowanie', element: <LoginPage /> },
      { path: '/rejestracja', element: <RegisterPage /> },
    ],
  },
  {
    element: (
      <RequireAuth>
        <AppLayout />
      </RequireAuth>
    ),
    children: [
      { path: '/', element: <HomePage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
