import { createBrowserRouter } from 'react-router-dom';
import { AppLayout } from './components/layout/AppLayout';
import { RedirectIfSignedIn, RequireAuth } from './features/auth/RequireAuth';
import { SignInPage } from './features/auth/SignInPage';
import { RegisterPage } from './features/auth/RegisterPage';
import { ForgotPasswordPage } from './features/auth/ForgotPasswordPage';
import { ResetPasswordPage } from './features/auth/ResetPasswordPage';
import { DashboardPage } from './features/dashboard/DashboardPage';
import { ProjectsPage } from './features/projects/ProjectsPage';
import { ProjectFormPage } from './features/projects/ProjectFormPage';
import { ProjectDetailPage } from './features/projects/ProjectDetailPage';
import { RequestDetailPage } from './features/requests/RequestDetailPage';
import { SettingsPage } from './features/settings/SettingsPage';
import { PublicProposalPage } from './features/public/PublicProposalPage';
import { NotFoundPage } from './features/NotFoundPage';
import { RouteErrorPage } from './features/RouteErrorPage';

export const router = createBrowserRouter([
  {
    path: '/sign-in',
    element: (
      <RedirectIfSignedIn>
        <SignInPage />
      </RedirectIfSignedIn>
    ),
  },
  {
    path: '/register',
    element: (
      <RedirectIfSignedIn>
        <RegisterPage />
      </RedirectIfSignedIn>
    ),
  },
  {
    path: '/forgot-password',
    element: (
      <RedirectIfSignedIn>
        <ForgotPasswordPage />
      </RedirectIfSignedIn>
    ),
  },
  { path: '/reset-password', element: <ResetPasswordPage /> },
  { path: '/p', element: <PublicProposalPage /> },
  {
    element: <RequireAuth />,
    errorElement: <RouteErrorPage />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { index: true, element: <DashboardPage /> },
          { path: 'projects', element: <ProjectsPage /> },
          { path: 'projects/new', element: <ProjectFormPage /> },
          { path: 'projects/:id', element: <ProjectDetailPage /> },
          { path: 'projects/:id/edit', element: <ProjectFormPage /> },
          { path: 'projects/:id/requests/:requestId', element: <RequestDetailPage /> },
          { path: 'settings', element: <SettingsPage /> },
        ],
      },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
]);
