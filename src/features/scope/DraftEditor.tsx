import { useEffect, useRef, useState, type FormEvent } from 'react';
import { TextAreaField, TextField } from '../../components/ui/Field';
import { Button } from '../../components/ui/Button';
import { Alert } from '../../components/ui/Alert';
import { ErrorSummary } from '../../components/ui/ErrorSummary';
import {
  confirmScope,
  updateDraft,
  type RevisionAllowanceType,
  type ScopeVersion,
} from '../../lib/api/scope';
import { errorMessages, toApiError } from '../../lib/api/errors';
import { summaryErrors } from '../../lib/domain/formErrors';
import { LIMITS } from '../../lib/domain/project';
import { useOnline } from '../../hooks/useOnline';
import { ScopeItemsEditor } from './ScopeItemsEditor';

const FIELD_IDS = {
  summary: 'scope-summary',
  revision_allowance: 'scope-allowance-not_specified',
  revision_count: 'scope-revision-count',
  notes: 'scope-notes',
};

type Errors = Partial<Record<keyof typeof FIELD_IDS, string>>;

export function DraftEditor({
  draft,
  hasBaseline,
  onChanged,
  onConfirmed,
}: {
  draft: ScopeVersion;
  hasBaseline: boolean;
  onChanged: () => Promise<void>;
  onConfirmed: () => Promise<void>;
}) {
  const online = useOnline();
  const [summary, setSummary] = useState(draft.summary ?? '');
  const [allowance, setAllowance] = useState<RevisionAllowanceType>(draft.revision_allowance_type);
  const [count, setCount] = useState(draft.revision_allowance_count?.toString() ?? '');
  const [notes, setNotes] = useState(draft.notes ?? '');
  const [errors, setErrors] = useState<Errors>({});
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const confirmRef = useRef<HTMLDivElement>(null);

  // Reset local fields when a different draft version arrives (e.g. after confirming).
  useEffect(() => {
    setSummary(draft.summary ?? '');
    setAllowance(draft.revision_allowance_type);
    setCount(draft.revision_allowance_count?.toString() ?? '');
    setNotes(draft.notes ?? '');
  }, [draft.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (confirming) confirmRef.current?.focus();
  }, [confirming]);

  const dirty =
    summary !== (draft.summary ?? '') ||
    allowance !== draft.revision_allowance_type ||
    (allowance === 'number' && count !== (draft.revision_allowance_count?.toString() ?? '')) ||
    notes !== (draft.notes ?? '');

  function validate(): Errors {
    const e: Errors = {};
    if (summary.length > LIMITS.summary) e.summary = `Use ${LIMITS.summary} characters or fewer.`;
    if (allowance === 'number' && !/^\d{1,4}$/.test(count.trim()))
      e.revision_count = 'Enter a whole number of revisions (0 or more).';
    if (notes.length > LIMITS.notes) e.notes = `Use ${LIMITS.notes} characters or fewer.`;
    return e;
  }

  async function save(): Promise<boolean> {
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length > 0) {
      setAttempt((n) => n + 1);
      return false;
    }
    setBusy(true);
    setStatus(null);
    try {
      await updateDraft(draft.id, {
        summary: summary.trim() === '' ? null : summary,
        revision_allowance_type: allowance,
        revision_allowance_count: allowance === 'number' ? Number(count.trim()) : null,
        notes: notes.trim() === '' ? null : notes,
      });
      await onChanged();
      setStatus({ tone: 'success', text: 'Draft saved.' });
      return true;
    } catch (err) {
      setStatus({ tone: 'error', text: errorMessages[toApiError(err).code] });
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (!busy) await save();
  }

  async function onConfirm() {
    if (busy) return;
    setConfirmError(null);
    if (dirty && !(await save())) {
      setConfirming(false);
      return;
    }
    setBusy(true);
    try {
      await confirmScope(draft.id);
      setConfirming(false);
      await onConfirmed();
    } catch (err) {
      setConfirmError(errorMessages[toApiError(err).code]);
    } finally {
      setBusy(false);
    }
  }

  const deliverables = draft.scope_items.filter((i) => i.kind === 'deliverable').length;
  const confirmLabel = hasBaseline
    ? `Confirm as version ${draft.version_no}`
    : 'Confirm original scope';

  return (
    <div className="space-y-6">
      <form noValidate onSubmit={onSave} className="space-y-4">
        <ErrorSummary
          errors={summaryErrors(errors, FIELD_IDS)}
          attempt={attempt}
          headingLevel={3}
        />
        <TextAreaField
          id={FIELD_IDS.summary}
          label="Scope summary"
          optional
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          error={errors.summary}
          maxLength={LIMITS.summary + 1}
        />
        <fieldset>
          <legend className="text-sm font-medium text-slate-800">Revisions included</legend>
          <div className="mt-2 space-y-2">
            {(
              [
                ['not_specified', 'Not specified'],
                ['none', 'No revisions included'],
                ['number', 'A set number of revisions'],
              ] as const
            ).map(([value, label]) => (
              <label key={value} className="flex min-h-11 items-center gap-3 text-sm">
                <input
                  type="radio"
                  name="revision-allowance"
                  id={`scope-allowance-${value}`}
                  value={value}
                  checked={allowance === value}
                  onChange={() => setAllowance(value)}
                  className="h-5 w-5"
                />
                {label}
              </label>
            ))}
          </div>
          {allowance === 'number' && (
            <div className="mt-2 max-w-40">
              <TextField
                id={FIELD_IDS.revision_count}
                label="Number of revisions"
                inputMode="numeric"
                value={count}
                onChange={(e) => setCount(e.target.value)}
                error={errors.revision_count}
              />
            </div>
          )}
        </fieldset>
        <TextAreaField
          id={FIELD_IDS.notes}
          label="Notes"
          optional
          hint="Your own notes about the agreement."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          error={errors.notes}
          maxLength={LIMITS.notes + 1}
          rows={3}
        />
        {status && <Alert tone={status.tone}>{status.text}</Alert>}
        <Button type="submit" variant="secondary" busy={busy} disabled={!online || !dirty}>
          Save draft
        </Button>
      </form>

      <div className="space-y-6 border-t border-slate-200 pt-6">
        <ScopeItemsEditor
          version={draft}
          kind="deliverable"
          disabled={!online}
          onChanged={onChanged}
        />
        <ScopeItemsEditor
          version={draft}
          kind="exclusion"
          disabled={!online}
          onChanged={onChanged}
        />
        <ScopeItemsEditor
          version={draft}
          kind="assumption"
          disabled={!online}
          onChanged={onChanged}
        />
      </div>

      <div className="border-t border-slate-200 pt-6">
        {!confirming ? (
          <div className="space-y-2">
            <Button type="button" onClick={() => setConfirming(true)} disabled={!online}>
              {confirmLabel}
            </Button>
            {deliverables === 0 && (
              <p className="text-sm text-slate-600">
                Add at least one deliverable before confirming.
              </p>
            )}
          </div>
        ) : (
          <div
            ref={confirmRef}
            tabIndex={-1}
            role="group"
            aria-labelledby="confirm-scope-heading"
            className="space-y-3 rounded-lg border-2 border-brand-600 bg-brand-50 p-4"
          >
            <h4 id="confirm-scope-heading" className="font-semibold">
              {confirmLabel}?
            </h4>
            <p className="text-sm">
              {hasBaseline
                ? 'This records the current draft as a new confirmed version. Your original agreement stays unchanged.'
                : "This records the scope, the project's agreed price, currency and deadline as your original agreement, with today's date. It can't be edited afterwards; later changes become new versions."}
            </p>
            {dirty && <p className="text-sm">Unsaved draft changes will be saved first.</p>}
            {confirmError && <Alert tone="error">{confirmError}</Alert>}
            <div className="flex flex-wrap gap-2">
              <Button type="button" busy={busy} onClick={() => void onConfirm()} disabled={!online}>
                Yes, confirm
              </Button>
              <Button type="button" variant="ghost" onClick={() => setConfirming(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
