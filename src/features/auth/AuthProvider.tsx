import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import { signOut as apiSignOut } from '../../lib/api/auth';
import {
  clearSessionMarker,
  hasSessionMarker,
  sessionEndedOnStartup,
  setSessionMarker,
} from '../../lib/domain/sessionMarker';

type AuthState = {
  session: Session | null;
  loading: boolean;
  /** True when a session ended without the user signing out here (expiry, revocation, tampering, other tab). */
  sessionEnded: boolean;
  acknowledgeSessionEnded: () => void;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

function storageKey(): string | null {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  if (!url) return null;
  try {
    return `sb-${new URL(url).hostname.split('.')[0]}-auth-token`;
  } catch {
    return null;
  }
}

function hadStoredSession(key: string | null): boolean {
  try {
    return key ? window.localStorage.getItem(key) !== null : false;
  } catch {
    return false;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionEnded, setSessionEnded] = useState(false);
  const deliberateSignOut = useRef(false);

  useEffect(() => {
    let active = true;
    const key = storageKey();
    const hadSession = hadStoredSession(key);
    // Read before any auth event can update it. Covers a token that was removed (AC-4, D-2).
    const hadMarker = hasSessionMarker();

    (async () => {
      const { data } = await supabase.auth.getSession();
      let current = data.session;
      if (current) {
        // Verify server-side: a tampered or revoked token must not keep the user "signed in" (AC-4).
        const { error } = await supabase.auth.getUser();
        if (error && error.status !== undefined && error.status >= 400 && error.status < 500) {
          deliberateSignOut.current = true; // suppress duplicate event handling below
          await supabase.auth.signOut({ scope: 'local' });
          deliberateSignOut.current = false;
          current = null;
        }
      }
      const ended = sessionEndedOnStartup({
        hasValidSession: current !== null,
        hadMarker,
        hadStoredToken: hadSession,
      });
      // Marker reflects the verified state; once a lost session is reported it is not repeated.
      if (current) setSessionMarker();
      else clearSessionMarker();
      if (active) {
        if (ended) setSessionEnded(true);
        setSession(current);
        setLoading(false);
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      if (!active) return;
      if (event === 'SIGNED_OUT' && !deliberateSignOut.current) setSessionEnded(true);
      if (event === 'SIGNED_IN') setSessionEnded(false);
      if (event === 'SIGNED_OUT') clearSessionMarker();
      else if (next) setSessionMarker();
      setSession(next);
    });

    // Cross-tab sign-out fallback (T-19): another tab removed the stored session.
    const onStorage = (e: StorageEvent) => {
      if (key && e.key === key && e.newValue === null) {
        setSession(null);
        setSessionEnded(true);
      }
    };
    window.addEventListener('storage', onStorage);

    return () => {
      active = false;
      sub.subscription.unsubscribe();
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const signOut = useCallback(async () => {
    deliberateSignOut.current = true;
    try {
      await apiSignOut();
    } finally {
      clearSessionMarker(); // deliberate sign-out: show "You've signed out.", not "session ended"
      setSession(null);
      setSessionEnded(false);
      deliberateSignOut.current = false;
    }
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      session,
      loading,
      sessionEnded,
      acknowledgeSessionEnded: () => setSessionEnded(false),
      signOut,
    }),
    [session, loading, sessionEnded, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
