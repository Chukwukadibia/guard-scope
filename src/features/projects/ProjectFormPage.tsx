import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { SelectField, TextAreaField, TextField } from '../../components/ui/Field';
import { Button, Spinner } from '../../components/ui/Button';
import { Alert } from '../../components/ui/Alert';
import { ErrorSummary } from '../../components/ui/ErrorSummary';
import { createProject, getProject, updateProject } from '../../lib/api/projects';
import { getMyProfile } from '../../lib/api/profile';
import { errorMessages, toApiError } from '../../lib/api/errors';
import { summaryErrors } from '../../lib/domain/formErrors';
import { numericToInput } from '../../lib/domain/format';
import { supportedCurrencies } from '../../lib/domain/profile';
import {
  LIMITS,
  toProjectInput,
  validateProject,
  type ProjectFieldErrors,
  type ProjectFormValues,
} from '../../lib/domain/project';
import { useOnline } from '../../hooks/useOnline';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';

const FIELD_IDS: Record<keyof ProjectFormValues, string> = {
  title: 'project-title',
  client_name: 'project-client-name',
  client_contact: 'project-client-contact',
  description: 'project-description',
  agreed_price: 'project-agreed-price',
  currency: 'project-currency',
  start_date: 'project-start-date',
  deadline: 'project-deadline',
};

const empty: ProjectFormValues = {
  title: '',
  client_name: '',
  client_contact: '',
  description: '',
  agreed_price: '',
  currency: '',
  start_date: '',
  deadline: '',
};

export function ProjectFormPage() {
  const { id } = useParams();
  const editing = Boolean(id);
  useDocumentTitle(editing ? 'Edit project' : 'New project');
  const navigate = useNavigate();
  const online = useOnline();
  const currencies = useMemo(() => supportedCurrencies(), []);
  const [values, setValues] = useState<ProjectFormValues>(empty);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [errors, setErrors] = useState<ProjectFieldErrors>({});
  const [attempt, setAttempt] = useState(0);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        if (id) {
          const p = await getProject(id);
          if (p.status === 'archived')
            throw toApiError({ code: 'P0001', message: 'project_archived' });
          if (active)
            setValues({
              title: p.title,
              client_name: p.client_name,
              client_contact: p.client_contact ?? '',
              description: p.description ?? '',
              agreed_price: numericToInput(p.agreed_price),
              currency: p.currency,
              start_date: p.start_date ?? '',
              deadline: p.deadline ?? '',
            });
        } else {
          const profile = await getMyProfile().catch(() => null);
          if (active) setValues({ ...empty, currency: profile?.default_currency ?? '' });
        }
        if (active) setLoadState('ready');
      } catch (e) {
        if (active) {
          setLoadError(errorMessages[toApiError(e).code]);
          setLoadState('error');
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [id]);

  const set = (k: keyof ProjectFormValues) => (e: { target: { value: string } }) =>
    setValues((v) => ({ ...v, [k]: e.target.value }));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const errs = validateProject(values);
    setErrors(errs);
    setFormError(null);
    if (Object.keys(errs).length > 0) {
      setAttempt((n) => n + 1);
      return;
    }
    setBusy(true);
    try {
      const input = toProjectInput(values);
      const p = id ? await updateProject(id, input) : await createProject(input);
      navigate(`/projects/${p.id}`, {
        replace: editing,
        state: { saved: editing ? 'updated' : 'created' },
      });
    } catch (err) {
      setFormError(errorMessages[toApiError(err).code]);
      setBusy(false);
    }
  }

  const title = editing ? 'Edit project' : 'New project';
  const cancelTo = id ? `/projects/${id}` : '/projects';

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
      {loadState === 'loading' && <Spinner label="Loading…" />}
      {loadState === 'error' && (
        <div className="space-y-3">
          <Alert tone="error">{loadError}</Alert>
          <Link to="/projects" className="text-sm text-brand-700 underline">
            Back to projects
          </Link>
        </div>
      )}
      {loadState === 'ready' && (
        <form noValidate onSubmit={onSubmit} className="space-y-6">
          <ErrorSummary errors={summaryErrors(errors, FIELD_IDS)} attempt={attempt} />
          {formError && <Alert tone="error">{formError}</Alert>}

          <fieldset className="space-y-4 rounded-lg border border-slate-200 bg-white p-4 sm:p-6">
            <legend className="px-1 text-base font-semibold">Project and client</legend>
            <TextField
              id={FIELD_IDS.title}
              label="Project title"
              value={values.title}
              onChange={set('title')}
              error={errors.title}
              maxLength={LIMITS.title + 1}
              required
            />
            <TextField
              id={FIELD_IDS.client_name}
              label="Client name"
              value={values.client_name}
              onChange={set('client_name')}
              error={errors.client_name}
              maxLength={LIMITS.client_name + 1}
              required
            />
            <TextField
              id={FIELD_IDS.client_contact}
              label="Client contact"
              optional
              hint="Email or phone, for your reference. GuardScope never contacts your client."
              value={values.client_contact}
              onChange={set('client_contact')}
              error={errors.client_contact}
              maxLength={LIMITS.client_contact + 1}
            />
            <TextAreaField
              id={FIELD_IDS.description}
              label="Description"
              optional
              value={values.description}
              onChange={set('description')}
              error={errors.description}
              maxLength={LIMITS.description + 1}
            />
          </fieldset>

          <fieldset className="space-y-4 rounded-lg border border-slate-200 bg-white p-4 sm:p-6">
            <legend className="px-1 text-base font-semibold">Price and dates</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                id={FIELD_IDS.agreed_price}
                label="Agreed price"
                optional
                inputMode="decimal"
                hint="The fee you agreed for the original scope."
                value={values.agreed_price}
                onChange={set('agreed_price')}
                error={errors.agreed_price}
              />
              <SelectField
                id={FIELD_IDS.currency}
                label="Currency"
                value={values.currency}
                onChange={set('currency')}
                error={errors.currency}
                required
              >
                <option value="">Choose a currency</option>
                {currencies.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </SelectField>
              <TextField
                id={FIELD_IDS.start_date}
                label="Start date"
                optional
                type="date"
                value={values.start_date}
                onChange={set('start_date')}
                error={errors.start_date}
              />
              <TextField
                id={FIELD_IDS.deadline}
                label="Deadline"
                optional
                type="date"
                value={values.deadline}
                onChange={set('deadline')}
                error={errors.deadline}
              />
            </div>
          </fieldset>

          <div className="flex flex-wrap gap-3">
            <Button type="submit" busy={busy} disabled={!online}>
              {editing ? 'Save changes' : 'Create project'}
            </Button>
            <Link
              to={cancelTo}
              className="inline-flex min-h-11 items-center rounded-md px-4 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              Cancel
            </Link>
          </div>
        </form>
      )}
    </div>
  );
}
