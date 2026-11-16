import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { TextField } from '../../components/ui/Field';
import { Button } from '../../components/ui/Button';
import { Alert } from '../../components/ui/Alert';
import { ErrorSummary } from '../../components/ui/ErrorSummary';
import { deleteMyAccount } from '../../lib/api/account';
import { errorMessages, toApiError } from '../../lib/api/errors';
import { useOnline } from '../../hooks/useOnline';
import { useAuth } from '../auth/AuthProvider';

const PASSWORD_ID = 'delete-account-password';

/** AUTH-004: permanent account deletion with clear consequences (BR-8). */
export function DeleteAccount() {
  const { session, signOut } = useAuth();
  const navigate = useNavigate();
  const online = useOnline();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const panelRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (open) document.getElementById(PASSWORD_ID)?.focus();
  }, [open]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const err = password ? undefined : 'Enter your password to confirm.';
    setError(err);
    setFormError(null);
    if (err) {
      setAttempt((n) => n + 1);
      return;
    }
    setBusy(true);
    try {
      await deleteMyAccount(session?.user.email ?? '', password);
      await signOut().catch(() => undefined);
      navigate('/sign-in', { replace: true, state: { accountDeleted: true } });
    } catch (e2) {
      const code = toApiError(e2).code;
      setFormError(
        code === 'invalid_credentials' ? 'That password is incorrect.' : errorMessages[code],
      );
      setBusy(false);
    }
  }

  return (
    <section
      aria-labelledby="delete-heading"
      className="rounded-lg border border-red-200 bg-white p-6"
    >
      <h2 id="delete-heading" className="text-lg font-semibold">
        Delete account
      </h2>
      <p className="mt-2 text-sm text-slate-700">
        This permanently deletes your account, profile, projects and recorded scope. It can&apos;t
        be undone, and GuardScope can&apos;t recover it. Download or copy anything you need first.
      </p>
      {!open ? (
        <Button variant="secondary" className="mt-4" onClick={() => setOpen(true)}>
          Delete my account…
        </Button>
      ) : (
        <form ref={panelRef} noValidate onSubmit={onSubmit} className="mt-4 max-w-md space-y-4">
          <ErrorSummary
            errors={error ? [{ fieldId: PASSWORD_ID, message: error }] : []}
            attempt={attempt}
            headingLevel={3}
          />
          {formError && <Alert tone="error">{formError}</Alert>}
          <TextField
            id={PASSWORD_ID}
            label="Your password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={error}
            hint="Required to confirm it's you."
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="submit"
              busy={busy}
              disabled={!online}
              className="bg-red-700 hover:bg-red-800"
            >
              Permanently delete account
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setOpen(false);
                setPassword('');
                setError(undefined);
                setFormError(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
