import { useState, type FormEvent } from 'react';
import { SelectField, TextAreaField, TextField } from '../../components/ui/Field';
import { Button } from '../../components/ui/Button';
import { Alert } from '../../components/ui/Alert';
import { ErrorSummary } from '../../components/ui/ErrorSummary';
import { errorMessages, toApiError } from '../../lib/api/errors';
import { summaryErrors } from '../../lib/domain/formErrors';
import {
  REQUEST_LIMITS,
  channelLabel,
  emptyRequest,
  todayLocal,
  toRequestInput,
  validateRequest,
  type RequestFieldErrors,
  type RequestFormValues,
} from '../../lib/domain/request';
import type { RequestInput } from '../../lib/api/requests';
import { useOnline } from '../../hooks/useOnline';

/** Shared create/edit form. `idPrefix` keeps field ids unique when two forms could exist on one page. */
export function RequestForm({
  idPrefix,
  initial,
  submitLabel,
  onSubmit,
  onCancel,
  compact = false,
}: {
  idPrefix: string;
  initial: RequestFormValues;
  submitLabel: string;
  onSubmit: (input: RequestInput) => Promise<void>;
  onCancel?: () => void;
  compact?: boolean;
}) {
  const online = useOnline();
  const ids = {
    title: `${idPrefix}-title`,
    received_on: `${idPrefix}-received-on`,
    source_channel: `${idPrefix}-channel`,
    description: `${idPrefix}-description`,
    internal_notes: `${idPrefix}-notes`,
  };
  const [values, setValues] = useState<RequestFormValues>(initial);
  const [errors, setErrors] = useState<RequestFieldErrors>({});
  const [attempt, setAttempt] = useState(0);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showMore, setShowMore] = useState(!compact);

  const set = (k: keyof RequestFormValues) => (e: { target: { value: string } }) =>
    setValues((v) => ({ ...v, [k]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const errs = validateRequest(values);
    setErrors(errs);
    setFormError(null);
    if (Object.keys(errs).length > 0) {
      if (errs.description || errs.internal_notes) setShowMore(true);
      setAttempt((n) => n + 1);
      return;
    }
    setBusy(true);
    try {
      await onSubmit(toRequestInput(values));
      if (compact) {
        setValues(emptyRequest());
        setShowMore(false);
        document.getElementById(ids.title)?.focus();
      }
    } catch (err) {
      setFormError(errorMessages[toApiError(err).code]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form noValidate onSubmit={submit} className="space-y-4">
      <ErrorSummary errors={summaryErrors(errors, ids)} attempt={attempt} headingLevel={3} />
      {formError && <Alert tone="error">{formError}</Alert>}
      <TextField
        id={ids.title}
        label="What did the client ask for?"
        value={values.title}
        onChange={set('title')}
        error={errors.title}
        maxLength={REQUEST_LIMITS.title + 1}
        required
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          id={ids.received_on}
          label="Received on"
          type="date"
          max={todayLocal()}
          value={values.received_on}
          onChange={set('received_on')}
          error={errors.received_on}
          required
        />
        <SelectField
          id={ids.source_channel}
          label="Received via"
          optional
          value={values.source_channel}
          onChange={set('source_channel')}
          error={errors.source_channel}
        >
          <option value="">Not recorded</option>
          {Object.entries(channelLabel).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </SelectField>
      </div>
      {compact && !showMore ? (
        <button
          type="button"
          className="min-h-11 text-sm text-brand-700 underline"
          onClick={() => setShowMore(true)}
          aria-expanded={false}
        >
          Add details or private notes
        </button>
      ) : (
        <>
          <TextAreaField
            id={ids.description}
            label="Details"
            optional
            hint="Paste or summarise the client's message."
            value={values.description}
            onChange={set('description')}
            error={errors.description}
            maxLength={REQUEST_LIMITS.description + 1}
            rows={3}
          />
          <TextAreaField
            id={ids.internal_notes}
            label="Private notes"
            optional
            hint="Private — never shown to your client."
            value={values.internal_notes}
            onChange={set('internal_notes')}
            error={errors.internal_notes}
            maxLength={REQUEST_LIMITS.internal_notes + 1}
            rows={2}
          />
        </>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" busy={busy} disabled={!online}>
          {submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
