import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthLayout } from '../../components/layout/AuthLayout';
import { TextField } from '../../components/ui/Field';
import { Button } from '../../components/ui/Button';
import { Alert } from '../../components/ui/Alert';
import { FullPageSpinner } from '../../components/layout/FullPageSpinner';
import { updatePassword } from '../../lib/api/auth';
import { errorMessages, toApiError } from '../../lib/api/errors';
import { PASSWORD_MIN, validateNewPassword } from '../../lib/domain/validation';
import { useOnline } from '../../hooks/useOnline';
import { useAuth } from './AuthProvider';

/** Reached from the emailed recovery link; supabase-js turns the link into a short-lived session. */
export function ResetPasswordPage() {
  const { session, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const online = useOnline();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string>();
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (loading) return <FullPageSpinner />;

  if (!session) {
    return (
      <AuthLayout title="Reset link not valid">
        <div className="space-y-4">
          <Alert tone="info">This reset link is invalid or has expired. Request a new one.</Alert>
          <Link to="/forgot-password" className="text-sm text-brand-700 underline">
            Request a new link
          </Link>
        </div>
      </AuthLayout>
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const err = validateNewPassword(password);
    setError(err);
    setFormError(null);
    if (err) return;
    setBusy(true);
    try {
      await updatePassword(password);
      await signOut();
      navigate('/sign-in', { replace: true, state: { passwordReset: true } });
    } catch (e2) {
      setFormError(errorMessages[toApiError(e2).code]);
      setBusy(false);
    }
  }

  return (
    <AuthLayout title="Choose a new password">
      <div className="space-y-4">
        {formError && <Alert tone="error">{formError}</Alert>}
        <form noValidate onSubmit={onSubmit} className="space-y-4">
          <TextField
            label="New password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={error}
            hint={`At least ${PASSWORD_MIN} characters.`}
            required
          />
          <Button type="submit" busy={busy} disabled={!online} className="w-full">
            Save new password
          </Button>
        </form>
      </div>
    </AuthLayout>
  );
}
