import { Navigate, Outlet, useLocation, useSearchParams } from 'react-router-dom';
import { safeNext } from '../../lib/domain/safeNext';
import { useAuth } from './AuthProvider';
import { FullPageSpinner } from '../../components/layout/FullPageSpinner';

/** Protected routes: nothing protected renders until a valid session is confirmed (AC-3). */
export function RequireAuth() {
  const { session, loading, sessionEnded } = useAuth();
  const location = useLocation();
  if (loading) return <FullPageSpinner />;
  if (!session) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/sign-in?next=${next}`} replace state={{ ended: sessionEnded }} />;
  }
  return <Outlet />;
}

/**
 * Public auth pages redirect signed-in users into the app. This is also the single place that
 * performs the post-sign-in redirect, so it always runs after the session is in context (no race).
 */
export function RedirectIfSignedIn({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  const [params] = useSearchParams();
  if (loading) return <FullPageSpinner />;
  if (session) return <Navigate to={safeNext(params.get('next'))} replace />;
  return <>{children}</>;
}
