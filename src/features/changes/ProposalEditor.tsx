import { useMemo, useState, type FormEvent } from 'react';
import { SelectField, TextAreaField, TextField } from '../../components/ui/Field';
import { Button } from '../../components/ui/Button';
import { Alert } from '../../components/ui/Alert';
import { ErrorSummary } from '../../components/ui/ErrorSummary';
import {
  discardProposalDraft,
  saveProposalDraft,
  sendProposalVersion,
  type ProposalVersion,
} from '../../lib/api/changeOrders';
import { errorMessages, toApiError } from '../../lib/api/errors';
import { summaryErrors } from '../../lib/domain/formErrors';
import { supportedCurrencies } from '../../lib/domain/profile';
import { todayLocal } from '../../lib/domain/request';
import {
  CO_LIMITS,
  timeUnitLabel,
  toProposalInput,
  validateProposalDraft,
  validateProposalForSend,
  proposalToFormValues,
  type ProposalFieldErrors,
  type ProposalFormValues,
} from '../../lib/domain/changeOrder';
import { useOnline } from '../../hooks/useOnline';
import { ProposalView } from './ProposalView';

const IDS: Record<keyof ProposalFormValues, string> = {
  title: 'proposal-title',
  description: 'proposal-description',
  price_impact: 'proposal-price',
  currency: 'proposal-currency',
  time_impact_value: 'proposal-time-value',
  time_impact_unit: 'proposal-time-unit',
  proposed_deadline: 'proposal-deadline',
  assumptions: 'proposal-assumptions',
  exclusions: 'proposal-exclusions',
  client_terms: 'proposal-terms',
};

export function ProposalEditor({
  draft,
  hasSentVersions,
  onChanged,
  onDiscarded,
}: {
  draft: ProposalVersion;
  hasSentVersions: boolean;
  onChanged: (message: string) => Promise<void>;
  onDiscarded: (removedWhole: boolean) => Promise<void>;
}) {
  const online = useOnline();
  const currencies = useMemo(() => supportedCurrencies(), []);
  const [saved, setSaved] = useState<ProposalFormValues>(() => proposalToFormValues(draft));
  const [values, setValues] = useState<ProposalFormValues>(() => proposalToFormValues(draft));
  const [errors, setErrors] = useState<ProposalFieldErrors>({});
  const [attempt, setAttempt] = useState(0);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<'send' | 'discard' | null>(null);
  const [preview, setPreview] = useState(false);

  const dirty = JSON.stringify(values) !== JSON.stringify(saved);
  const set = (k: keyof ProposalFormValues) => (e: { target: { value: string } }) =>
    setValues((v) => ({ ...v, [k]: e.target.value }));

  async function persist(errs: ProposalFieldErrors): Promise<boolean> {
    setErrors(errs);
    setFormError(null);
    if (Object.keys(errs).length > 0) {
      setAttempt((n) => n + 1);
      setConfirm(null);
      return false;
    }
    if (!dirty) return true;
    const updated = await saveProposalDraft(draft.id, toProposalInput(values));
    const next = proposalToFormValues(updated);
    setSaved(next);
    setValues(next);
    return true;
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      if (await persist(validateProposalDraft(values))) await onChanged('Draft saved.');
    } catch (err) {
      setFormError(errorMessages[toApiError(err).code]);
    } finally {
      setBusy(false);
    }
  }

  async function onSend() {
    if (busy) return;
    setBusy(true);
    try {
      if (!(await persist(validateProposalForSend(values)))) return;
      await sendProposalVersion(draft.id);
      setConfirm(null);
      await onChanged(`Version ${draft.version_no} sent. Its content is now fixed.`);
    } catch (err) {
      setFormError(errorMessages[toApiError(err).code]);
      setConfirm(null);
    } finally {
      setBusy(false);
    }
  }

  async function onDiscard() {
    if (busy) return;
    setBusy(true);
    try {
      await onDiscarded(await discardProposalDraft(draft.id));
    } catch (err) {
      setFormError(errorMessages[toApiError(err).code]);
      setConfirm(null);
      setBusy(false);
    }
  }

  const previewVersion: ProposalVersion = {
    ...draft,
    ...toProposalInput(values),
    price_impact: toProposalInput(values).price_impact,
  };

  return (
    <div className="space-y-6">
      <form noValidate onSubmit={onSave} className="space-y-4">
        <ErrorSummary errors={summaryErrors(errors, IDS)} attempt={attempt} headingLevel={3} />
        {formError && <Alert tone="error">{formError}</Alert>}
        <p className="text-sm text-slate-600">
          Everything below except the buttons is what your client will see once sent.
        </p>
        <TextField
          id={IDS.title}
          label="Title"
          value={values.title}
          onChange={set('title')}
          error={errors.title}
          maxLength={CO_LIMITS.title + 1}
          required
        />
        <TextAreaField
          id={IDS.description}
          label="What's included in this change"
          value={values.description}
          onChange={set('description')}
          error={errors.description}
          maxLength={CO_LIMITS.text + 1}
          rows={4}
          hint="Required before sending."
        />
        <fieldset className="space-y-4 rounded-md border border-slate-200 p-4">
          <legend className="px-1 text-sm font-semibold">Proposed impact</legend>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <TextField
              id={IDS.price_impact}
              label="Price impact"
              optional
              inputMode="decimal"
              value={values.price_impact}
              onChange={set('price_impact')}
              error={errors.price_impact}
              hint="Leave empty for a time-only change."
            />
            <SelectField
              id={IDS.currency}
              label="Currency"
              value={values.currency}
              onChange={set('currency')}
              error={errors.currency}
            >
              {currencies.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </SelectField>
            <TextField
              id={IDS.time_impact_value}
              label="Time impact"
              optional
              inputMode="decimal"
              value={values.time_impact_value}
              onChange={set('time_impact_value')}
              error={errors.time_impact_value}
            />
            <SelectField
              id={IDS.time_impact_unit}
              label="Time unit"
              optional
              value={values.time_impact_unit}
              onChange={set('time_impact_unit')}
              error={errors.time_impact_unit}
            >
              <option value="">None</option>
              {Object.entries(timeUnitLabel).map(([value, l]) => (
                <option key={value} value={value}>
                  {l.many}
                </option>
              ))}
            </SelectField>
            <TextField
              id={IDS.proposed_deadline}
              label="Proposed new deadline"
              optional
              type="date"
              min={todayLocal()}
              value={values.proposed_deadline}
              onChange={set('proposed_deadline')}
              error={errors.proposed_deadline}
              hint="Your original deadline is kept on record."
            />
          </div>
        </fieldset>
        <TextAreaField
          id={IDS.assumptions}
          label="Assumptions"
          optional
          value={values.assumptions}
          onChange={set('assumptions')}
          error={errors.assumptions}
          maxLength={CO_LIMITS.text + 1}
          rows={2}
        />
        <TextAreaField
          id={IDS.exclusions}
          label="Not included in this change"
          optional
          value={values.exclusions}
          onChange={set('exclusions')}
          error={errors.exclusions}
          maxLength={CO_LIMITS.text + 1}
          rows={2}
        />
        <TextAreaField
          id={IDS.client_terms}
          label="Terms"
          optional
          value={values.client_terms}
          onChange={set('client_terms')}
          error={errors.client_terms}
          maxLength={CO_LIMITS.text + 1}
          rows={2}
        />
        <div className="flex flex-wrap gap-2">
          <Button
            type="submit"
            variant="secondary"
            busy={busy && confirm === null}
            disabled={!online || !dirty}
          >
            Save draft
          </Button>
          <Button
            type="button"
            variant="ghost"
            aria-expanded={preview}
            onClick={() => setPreview((p) => !p)}
          >
            {preview ? 'Hide client preview' : 'Preview what your client sees'}
          </Button>
        </div>
      </form>

      {preview && (
        <section
          aria-labelledby="client-preview-heading"
          className="rounded-lg border border-dashed border-slate-400 p-4"
        >
          <h3
            id="client-preview-heading"
            className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-600"
          >
            Client preview
          </h3>
          <ProposalView version={previewVersion} headingLevel={4} />
        </section>
      )}

      <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-4">
        <Button type="button" onClick={() => setConfirm('send')} disabled={!online || busy}>
          Send version {draft.version_no}…
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => setConfirm('discard')}
          disabled={!online || busy}
        >
          {hasSentVersions ? 'Discard this draft…' : 'Discard proposal…'}
        </Button>
      </div>

      {confirm === 'send' && (
        <div
          role="group"
          aria-labelledby="send-confirm-heading"
          className="space-y-3 rounded-lg border-2 border-brand-600 bg-brand-50 p-4"
        >
          <h3 id="send-confirm-heading" className="font-semibold">
            Send version {draft.version_no}?
          </h3>
          <p className="text-sm">
            Sending fixes this version exactly as written, with today&apos;s date. It can&apos;t be
            edited afterwards; any change becomes a new version.
            {hasSentVersions &&
              ' A previously sent version that is still waiting for the client will be marked as replaced.'}
          </p>
          <p className="text-sm">
            Secure approval links for your client arrive in the next release. For now, sending
            records the proposal.
          </p>
          {dirty && <p className="text-sm">Unsaved changes will be saved first.</p>}
          <div className="flex flex-wrap gap-2">
            <Button type="button" busy={busy} onClick={() => void onSend()} disabled={!online}>
              Yes, send version {draft.version_no}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
      {confirm === 'discard' && (
        <div
          role="group"
          aria-labelledby="discard-confirm-heading"
          className="space-y-3 rounded-lg border-2 border-slate-400 bg-white p-4"
        >
          <h3 id="discard-confirm-heading" className="font-semibold">
            {hasSentVersions
              ? `Discard draft version ${draft.version_no}?`
              : 'Discard this unsent proposal?'}
          </h3>
          <p className="text-sm">
            {hasSentVersions
              ? 'Earlier sent versions stay in the record.'
              : 'Nothing was sent, so the whole proposal is removed. The request stays marked as Additional.'}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              busy={busy}
              onClick={() => void onDiscard()}
              disabled={!online}
            >
              Yes, discard
            </Button>
            <Button type="button" variant="ghost" onClick={() => setConfirm(null)}>
              Keep it
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
