import { useState, type FormEvent } from 'react';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { ErrorSummary } from '../../components/ui/ErrorSummary';
import { TextAreaField } from '../../components/ui/Field';
import { useOnline } from '../../hooks/useOnline';
import { summaryErrors } from '../../lib/domain/formErrors';
import { COMMENT_MAX, confirmationText, type ClientDecision } from '../../lib/domain/publicLink';

const ACTIONS: { value: ClientDecision; label: string; confirm: string; hint?: string }[] = [
  { value: 'approved', label: 'Approve', confirm: 'Yes, approve' },
  { value: 'declined', label: 'Decline', confirm: 'Yes, decline' },
  {
    value: 'clarification_requested',
    label: 'I have a question / need clarification',
    confirm: 'Yes, send my question',
  },
];

const COMMENT_ID = 'client-comment';

export function PublicDecisionForm({
  versionNo,
  onSubmit,
}: {
  versionNo: number;
  /** Resolves to a message when the answer was not recorded; null when the page has moved on. */
  onSubmit: (decision: ClientDecision, comment: string) => Promise<{ error: string } | null>;
}) {
  const online = useOnline();
  const [comment, setComment] = useState('');
  const [choice, setChoice] = useState<ClientDecision | null>(null);
  const [commentError, setCommentError] = useState<string | undefined>();
  const [attempt, setAttempt] = useState(0);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function pick(d: ClientDecision) {
    setFormError(null);
    if (comment.length > COMMENT_MAX) {
      setCommentError(`Use ${COMMENT_MAX} characters or fewer.`);
      setAttempt((n) => n + 1);
      return;
    }
    setCommentError(undefined);
    setChoice(d);
  }

  async function confirm(e: FormEvent) {
    e.preventDefault();
    if (busy || !choice) return;
    setBusy(true);
    setFormError(null);
    const r = await onSubmit(choice, comment);
    if (r) {
      setFormError(r.error);
      setBusy(false);
    }
    // On null the page navigates to another view, so this component unmounts.
  }

  const action = ACTIONS.find((a) => a.value === choice);

  return (
    <section
      aria-labelledby="respond-heading"
      className="mt-6 space-y-4 rounded-lg border border-slate-200 bg-white p-4 sm:p-6"
    >
      <h2 id="respond-heading" className="text-lg font-semibold text-slate-900">
        Your response
      </h2>
      <ErrorSummary
        errors={summaryErrors({ comment: commentError }, { comment: COMMENT_ID })}
        attempt={attempt}
      />
      {formError && <Alert tone="error">{formError}</Alert>}
      <form noValidate onSubmit={(e) => void confirm(e)} className="space-y-4">
        <div>
          <TextAreaField
            id={COMMENT_ID}
            label="Comment"
            optional
            rows={4}
            value={comment}
            disabled={busy}
            onChange={(e) => {
              setComment(e.target.value);
              setChoice(null);
              setCommentError(undefined);
            }}
            error={commentError}
            hint="Anything you want the sender to know."
          />
          <p className="mt-1 text-right text-xs text-slate-600" aria-live="polite">
            {comment.length} / {COMMENT_MAX}
          </p>
        </div>

        {!action && (
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {ACTIONS.map((a) => (
              <Button
                key={a.value}
                type="button"
                variant={a.value === 'approved' ? 'primary' : 'secondary'}
                disabled={busy || !online}
                onClick={() => pick(a.value)}
              >
                {a.label}
              </Button>
            ))}
          </div>
        )}

        {action && (
          <div
            role="group"
            aria-labelledby="confirm-heading"
            className="space-y-3 rounded-lg border-2 border-brand-600 bg-brand-50 p-4"
          >
            <h3 id="confirm-heading" className="font-semibold">
              Please confirm
            </h3>
            <p className="text-sm">{confirmationText(action.value, versionNo)}</p>
            {comment.trim() && <p className="text-sm">Your comment will be included.</p>}
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button type="submit" busy={busy} disabled={!online}>
                {action.confirm}
              </Button>
              <Button type="button" variant="ghost" disabled={busy} onClick={() => setChoice(null)}>
                Go back
              </Button>
            </div>
          </div>
        )}
      </form>
    </section>
  );
}
