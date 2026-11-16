import { createBrowserRouter } from 'react-router-dom';
import { AppLayout } from './components/layout/AppLayout';
import { RedirectIfSignedIn, RequireAuth } from './features/auth/RequireAuth';
import { SignInPage } from './features/auth/SignInPage';
import { RegisterPage } from './features/auth/RegisterPage';
import { ForgotPasswordPage } from './features/auth/ForgotPasswordPage';
import { ResetPasswordPage } from './features/auth/ResetPasswordPage';
import { DashboardPage } from './features/dashboard/DashboardPage';
import { ProjectsPage } from './features/projects/ProjectsPage';
import { SettingsPage } from './features/settings/SettingsPage';
import { PublicProposalPage } from './features/public/PublicProposalPage';
import { NotFoundPage } from './features/NotFoundPage';

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
    children: [
      {
        element: <AppLayout />,
        children: [
          { index: true, element: <DashboardPage /> },
          { path: 'projects', element: <ProjectsPage /> },
          { path: 'settings', element: <SettingsPage /> },
        ],
      },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
]);
