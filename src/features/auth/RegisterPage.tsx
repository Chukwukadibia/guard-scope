import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { AuthLayout } from '../../components/layout/AuthLayout';
import { TextField } from '../../components/ui/Field';
import { Button } from '../../components/ui/Button';
import { Alert } from '../../components/ui/Alert';
import { signUp } from '../../lib/api/auth';
import { errorMessages, toApiError } from '../../lib/api/errors';
import { PASSWORD_MIN, validateEmail, validateNewPassword } from '../../lib/domain/validation';
import { useOnline } from '../../hooks/useOnline';

export function RegisterPage() {
  const online = useOnline();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const errs = { email: validateEmail(email), password: validateNewPassword(password) };
    setFieldErrors(errs);
    setFormError(null);
    if (errs.email || errs.password) return;
    setBusy(true);
    try {
      await signUp(email.trim(), password);
      setDone(true); // identical outcome whether or not the email is already registered (AC-11)
    } catch (err) {
      setFormError(errorMessages[toApiError(err).code]);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <AuthLayout title="Check your email">
        <div className="space-y-4">
          <Alert tone="success">
            If this email can be registered, we&apos;ve sent a link to confirm your account. Open
            it, then sign in.
          </Alert>
          <Link to="/sign-in" className="text-sm text-brand-700 underline">
            Go to sign in
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Create your account">
      <div className="space-y-4">
        {formError && <Alert tone="error">{formError}</Alert>}
        <form noValidate onSubmit={onSubmit} className="space-y-4">
          <TextField
            label="Email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={fieldErrors.email}
            required
          />
          <TextField
            label="Password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={fieldErrors.password}
            hint={`At least ${PASSWORD_MIN} characters.`}
            required
          />
          <Button type="submit" busy={busy} disabled={!online} className="w-full">
            Create account
          </Button>
        </form>
        <p className="text-sm text-slate-600">
          Already have an account?{' '}
          <Link to="/sign-in" className="text-brand-700 underline">
            Sign in
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
}
