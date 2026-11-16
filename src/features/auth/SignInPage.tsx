import { useState, type FormEvent } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { AuthLayout } from '../../components/layout/AuthLayout';
import { TextField } from '../../components/ui/Field';
import { Button } from '../../components/ui/Button';
import { Alert } from '../../components/ui/Alert';
import { ErrorSummary } from '../../components/ui/ErrorSummary';
import { summaryErrors } from '../../lib/domain/formErrors';
import { signIn } from '../../lib/api/auth';
import { errorMessages, toApiError } from '../../lib/api/errors';
import { validateEmail } from '../../lib/domain/validation';
import { useOnline } from '../../hooks/useOnline';
import { useAuth } from './AuthProvider';

const FIELD_IDS = { email: 'sign-in-email', password: 'sign-in-password' };

export function SignInPage() {
  const location = useLocation();
  const [params] = useSearchParams();
  const online = useOnline();
  const { sessionEnded, acknowledgeSessionEnded } = useAuth();
  const state = (location.state ?? {}) as {
    ended?: boolean;
    signedOut?: boolean;
    passwordReset?: boolean;
    accountDeleted?: boolean;
  };

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const notice = state.accountDeleted
    ? 'Your account and all its data have been deleted.'
    : state.signedOut
      ? "You've signed out."
      : state.passwordReset
        ? 'Your password was changed. Please sign in.'
        : params.get('confirmed')
          ? 'Your email is confirmed. You can sign in now.'
          : null;
  const ended = !state.signedOut && !state.accountDeleted && (state.ended || sessionEnded);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const errs = {
      email: validateEmail(email),
      password: password ? undefined : 'Enter your password.',
    };
    setFieldErrors(errs);
    setFormError(null);
    if (errs.email || errs.password) {
      setAttempt((n) => n + 1);
      return;
    }
    setBusy(true);
    try {
      await signIn(email.trim(), password);
      // RedirectIfSignedIn navigates to the safe `next` path once the session reaches context.
      acknowledgeSessionEnded();
    } catch (err) {
      setFormError(errorMessages[toApiError(err).code]);
      setBusy(false);
    }
  }

  return (
    <AuthLayout title="Sign in">
      <div className="space-y-4">
        {ended && <Alert tone="info">{errorMessages.not_authenticated}</Alert>}
        {notice && <Alert tone="success">{notice}</Alert>}
        {formError && <Alert tone="error">{formError}</Alert>}
        <ErrorSummary errors={summaryErrors(fieldErrors, FIELD_IDS)} attempt={attempt} />
        <form noValidate onSubmit={onSubmit} className="space-y-4">
          <TextField
            id={FIELD_IDS.email}
            label="Email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={fieldErrors.email}
            required
          />
          <TextField
            id={FIELD_IDS.password}
            label="Password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={fieldErrors.password}
            required
          />
          <Button type="submit" busy={busy} disabled={!online} className="w-full">
            Sign in
          </Button>
        </form>
        <div className="flex flex-col gap-2 text-sm sm:flex-row sm:justify-between">
          <Link to="/forgot-password" className="text-brand-700 underline">
            Forgot your password?
          </Link>
          <Link to="/register" className="text-brand-700 underline">
            Create an account
          </Link>
        </div>
      </div>
    </AuthLayout>
  );
}
