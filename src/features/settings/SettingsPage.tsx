import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { TextField, SelectField } from '../../components/ui/Field';
import { Button, Spinner } from '../../components/ui/Button';
import { Alert } from '../../components/ui/Alert';
import { ErrorSummary } from '../../components/ui/ErrorSummary';
import { summaryErrors } from '../../lib/domain/formErrors';
import { getMyProfile, updateMyProfile } from '../../lib/api/profile';
import { errorMessages, toApiError } from '../../lib/api/errors';
import {
  DISPLAY_NAME_MAX,
  supportedCurrencies,
  validateProfileInput,
  type ProfileFieldErrors,
} from '../../lib/domain/profile';
import { useOnline } from '../../hooks/useOnline';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useAuth } from '../auth/AuthProvider';
import { DeleteAccount } from './DeleteAccount';

const FIELD_IDS = {
  display_name: 'settings-display-name',
  default_currency: 'settings-default-currency',
};

function currencyLabel(code: string): string {
  try {
    const name = new Intl.DisplayNames(['en'], { type: 'currency' }).of(code);
    return name && name !== code ? `${code} — ${name}` : code;
  } catch {
    return code;
  }
}

export function SettingsPage() {
  useDocumentTitle('Settings');
  const { session } = useAuth();
  const online = useOnline();
  const currencies = useMemo(() => supportedCurrencies(), []);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [currency, setCurrency] = useState('');
  const [errors, setErrors] = useState<ProfileFieldErrors>({});
  const [status, setStatus] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);

  async function load() {
    setLoadState('loading');
    try {
      const p = await getMyProfile();
      setDisplayName(p.display_name ?? '');
      setCurrency(p.default_currency ?? '');
      setLoadState('ready');
    } catch (err) {
      setLoadError(errorMessages[toApiError(err).code]);
      setLoadState('error');
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const input = {
      display_name: displayName.trim() === '' ? null : displayName.trim(),
      default_currency: currency === '' ? null : currency,
    };
    const errs = validateProfileInput(input);
    setErrors(errs);
    setStatus(null);
    if (Object.keys(errs).length > 0) {
      setAttempt((n) => n + 1);
      return;
    }
    setBusy(true);
    try {
      const p = await updateMyProfile(input);
      setDisplayName(p.display_name ?? '');
      setCurrency(p.default_currency ?? '');
      setStatus({ tone: 'success', text: 'Settings saved.' });
    } catch (err) {
      setStatus({ tone: 'error', text: errorMessages[toApiError(err).code] });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-slate-900">Settings</h1>

      <section
        aria-labelledby="account-heading"
        className="rounded-lg border border-slate-200 bg-white p-6"
      >
        <h2 id="account-heading" className="text-lg font-semibold">
          Account
        </h2>
        <dl className="mt-3 text-sm">
          <dt className="text-slate-600">Signed in as</dt>
          <dd className="mt-0.5 break-all font-medium">{session?.user.email}</dd>
        </dl>
      </section>

      <section
        aria-labelledby="profile-heading"
        className="rounded-lg border border-slate-200 bg-white p-6"
      >
        <h2 id="profile-heading" className="text-lg font-semibold">
          Profile
        </h2>
        {loadState === 'loading' && (
          <div className="mt-4">
            <Spinner label="Loading your settings…" />
          </div>
        )}
        {loadState === 'error' && (
          <div className="mt-4 space-y-3">
            <Alert tone="error">{loadError}</Alert>
            <Button variant="secondary" onClick={() => void load()}>
              Try again
            </Button>
          </div>
        )}
        {loadState === 'ready' && (
          <form noValidate onSubmit={onSubmit} className="mt-4 max-w-md space-y-4">
            <ErrorSummary
              errors={summaryErrors(errors, FIELD_IDS)}
              attempt={attempt}
              headingLevel={3}
            />
            <TextField
              id={FIELD_IDS.display_name}
              label="Display or business name"
              optional
              maxLength={DISPLAY_NAME_MAX + 1}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              error={errors.display_name}
              hint="Shown to your clients on proposals."
              autoComplete="organization"
            />
            <SelectField
              id={FIELD_IDS.default_currency}
              label="Default currency"
              optional
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              error={errors.default_currency}
              hint="Pre-selected when you create a project. You can choose a different currency per project."
            >
              <option value="">Not set</option>
              {currencies.map((c) => (
                <option key={c} value={c}>
                  {currencyLabel(c)}
                </option>
              ))}
            </SelectField>
            {status && <Alert tone={status.tone}>{status.text}</Alert>}
            <Button type="submit" busy={busy} disabled={!online}>
              Save settings
            </Button>
          </form>
        )}
      </section>
      <DeleteAccount />
    </div>
  );
}
