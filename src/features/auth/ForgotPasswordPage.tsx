import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { AuthLayout } from '../../components/layout/AuthLayout';
import { TextField } from '../../components/ui/Field';
import { Button } from '../../components/ui/Button';
import { Alert } from '../../components/ui/Alert';
import { ErrorSummary } from '../../components/ui/ErrorSummary';
import { summaryErrors } from '../../lib/domain/formErrors';
import { requestPasswordReset } from '../../lib/api/auth';
import { errorMessages, toApiError } from '../../lib/api/errors';
import { validateEmail } from '../../lib/domain/validation';
import { useOnline } from '../../hooks/useOnline';

const FIELD_IDS = { email: 'forgot-password-email' };

export function ForgotPasswordPage() {
  const online = useOnline();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string>();
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const err = validateEmail(email);
    setError(err);
    setFormError(null);
    if (err) {
      setAttempt((n) => n + 1);
      return;
    }
    setBusy(true);
    try {
      await requestPasswordReset(email.trim());
      setSent(true);
    } catch (e2) {
      setFormError(errorMessages[toApiError(e2).code]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout title="Reset your password">
      <div className="space-y-4">
        {sent ? (
          <Alert tone="success">
            If an account exists for that email, we&apos;ve sent a link to reset the password.
          </Alert>
        ) : (
          <>
            {formError && <Alert tone="error">{formError}</Alert>}
            <ErrorSummary errors={summaryErrors({ email: error }, FIELD_IDS)} attempt={attempt} />
            <form noValidate onSubmit={onSubmit} className="space-y-4">
              <TextField
                id={FIELD_IDS.email}
                label="Email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                error={error}
                required
              />
              <Button type="submit" busy={busy} disabled={!online} className="w-full">
                Send reset link
              </Button>
            </form>
          </>
        )}
        <Link to="/sign-in" className="text-sm text-brand-700 underline">
          Back to sign in
        </Link>
      </div>
    </AuthLayout>
  );
}
