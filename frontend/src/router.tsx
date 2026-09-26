import { createBrowserRouter } from 'react-router';
import { GuestOnly, RequireAuth, RequireRole } from './auth/RequireAuth';
import { AppLayout, AuthLayout } from './layout/AppLayout';
import { OfficeLayout } from './layout/OfficeLayout';
import { DocumentDetailsPage } from './pages/DocumentDetailsPage';
import { DocumentsPage } from './pages/DocumentsPage';
import { NewDocumentPage } from './pages/NewDocumentPage';
import { ProfilePage } from './pages/ProfilePage';
import { LoginPage } from './pages/LoginPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { OfficeDocumentPage } from './pages/OfficeDocumentPage';
import { OfficeDocumentsPage } from './pages/OfficeDocumentsPage';
import { RegisterPage } from './pages/RegisterPage';

/**
 * Application routes (Polish URLs):
 * - `/logowanie`, `/rejestracja` – only for logged-out users,
 * - `/biuro…` – the office panel, only for office accounts,
 * - everything else – the driver's part, only for driver accounts, inside the main
 *   layout. A user of the other role is sent to the start page of his role.
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
    path: '/biuro',
    element: (
      <RequireAuth>
        <RequireRole role="OFFICE">
          <OfficeLayout />
        </RequireRole>
      </RequireAuth>
    ),
    children: [
      { index: true, element: <OfficeDocumentsPage key="to-review" toReview /> },
      { path: 'wszystkie', element: <OfficeDocumentsPage key="all" toReview={false} /> },
      { path: 'dokumenty/:id', element: <OfficeDocumentPage /> },
    ],
  },
  {
    element: (
      <RequireAuth>
        <RequireRole role="DRIVER">
          <AppLayout />
        </RequireRole>
      </RequireAuth>
    ),
    children: [
      { path: '/', element: <DocumentsPage /> },
      { path: '/dokumenty/nowy', element: <NewDocumentPage /> },
      { path: '/dokumenty/:id', element: <DocumentDetailsPage /> },
      { path: '/profil', element: <ProfilePage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
