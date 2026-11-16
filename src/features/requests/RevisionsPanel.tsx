import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Alert } from '../../components/ui/Alert';
import { Button, Spinner } from '../../components/ui/Button';
import { SelectField, TextField } from '../../components/ui/Field';
import {
  listRevisionUsages,
  recordRevisionUsage,
  undoRevisionUsage,
  type RevisionUsage,
} from '../../lib/api/revisions';
import type { RequestListItem } from '../../lib/api/requests';
import type { ScopeVersion } from '../../lib/api/scope';
import { errorMessages, toApiError } from '../../lib/api/errors';
import { formatDateTime, revisionAllowanceLabel } from '../../lib/domain/format';
import { REQUEST_LIMITS, summariseRevisions } from '../../lib/domain/request';
import { useOnline } from '../../hooks/useOnline';

/**
 * PRD §7.2: allowance comes from the latest confirmed scope; usage counts only what the freelancer records.
 * Nothing is inferred from messages or requests.
 */
export function RevisionsPanel({
  projectId,
  currentScope,
  archived,
  requests,
  fixedRequestId,
}: {
  projectId: string;
  currentScope: ScopeVersion | null;
  archived: boolean;
  requests: RequestListItem[];
  /** On a request page: usage is linked to this request and the list is filtered to it. */
  fixedRequestId?: string;
}) {
  const online = useOnline();
  const [usages, setUsages] = useState<RevisionUsage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [noteError, setNoteError] = useState<string>();
  const [requestId, setRequestId] = useState(fixedRequestId ?? '');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const prefix = fixedRequestId ? 'req-rev' : 'proj-rev';

  const load = useCallback(async () => {
    try {
      setUsages(await listRevisionUsages(projectId));
    } catch (e) {
      setError(errorMessages[toApiError(e).code]);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = summariseRevisions(
    currentScope ? currentScope.revision_allowance_type : null,
    currentScope?.revision_allowance_count ?? null,
    usages?.length ?? 0,
  );
  const canRecord = Boolean(currentScope) && !archived && online;
  const titleOf = (id: string | null) => requests.find((r) => r.id === id)?.title;

  async function onRecord(e: FormEvent) {
    e.preventDefault();
    if (busy || !canRecord) return;
    if (note.length > REQUEST_LIMITS.revision_note) {
      setNoteError(`Use ${REQUEST_LIMITS.revision_note} characters or fewer.`);
      return;
    }
    setNoteError(undefined);
    setBusy(true);
    setError(null);
    try {
      await recordRevisionUsage(
        projectId,
        requestId || null,
        note.trim() === '' ? null : note.trim(),
      );
      setNote('');
      setNotice('Revision recorded as used.');
      await load();
    } catch (err) {
      setError(errorMessages[toApiError(err).code]);
    } finally {
      setBusy(false);
    }
  }

  async function onUndo(id: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await undoRevisionUsage(id);
      setNotice('Recorded revision undone.');
      await load();
    } catch (err) {
      setError(errorMessages[toApiError(err).code]);
    } finally {
      setBusy(false);
    }
  }

  const visible = (usages ?? []).filter((u) => !fixedRequestId || u.request_id === fixedRequestId);

  return (
    <section
      aria-labelledby={`${prefix}-heading`}
      className="space-y-4 rounded-lg border border-slate-200 bg-white p-4 sm:p-6"
    >
      <h2 id={`${prefix}-heading`} className="text-lg font-semibold">
        {fixedRequestId ? 'Revisions for this request' : 'Revisions'}
      </h2>
      {!currentScope ? (
        <Alert tone="info">
          Confirm the scope to start tracking revisions against your allowance.
        </Alert>
      ) : usages === null ? (
        <Spinner label="Loading revisions…" />
      ) : (
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-slate-600">Included in agreement</dt>
            <dd className="font-medium">
              {revisionAllowanceLabel(
                currentScope.revision_allowance_type,
                currentScope.revision_allowance_count,
              )}
            </dd>
          </div>
          <div>
            <dt className="text-slate-600">Recorded as used (whole project)</dt>
            <dd className="font-medium" data-testid="revisions-used">
              {summary.used}
            </dd>
          </div>
          {summary.remaining !== null && (
            <div>
              <dt className="text-slate-600">Remaining</dt>
              <dd className="font-medium" data-testid="revisions-remaining">
                {summary.remaining}
                {summary.overBy > 0 && ` (${summary.used} used of ${summary.allowanceCount})`}
              </dd>
            </div>
          )}
        </dl>
      )}
      {error && <Alert tone="error">{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}

      {currentScope && !archived && (
        <form
          noValidate
          onSubmit={onRecord}
          className="space-y-3 rounded-md border border-slate-200 bg-slate-50 p-3"
        >
          <p className="text-sm text-slate-700">
            Only record a revision when you decide one has been used. GuardScope never counts them
            for you.
          </p>
          {!fixedRequestId && (
            <SelectField
              id={`${prefix}-request`}
              label="Related request"
              optional
              value={requestId}
              onChange={(e) => setRequestId(e.target.value)}
            >
              <option value="">None</option>
              {requests.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title.length > 80 ? `${r.title.slice(0, 80)}…` : r.title}
                </option>
              ))}
            </SelectField>
          )}
          <TextField
            id={`${prefix}-note`}
            label="Note"
            optional
            value={note}
            onChange={(e) => setNote(e.target.value)}
            error={noteError}
            maxLength={REQUEST_LIMITS.revision_note + 1}
          />
          <Button type="submit" variant="secondary" busy={busy} disabled={!canRecord}>
            Record a revision as used
          </Button>
        </form>
      )}

      {visible.length > 0 && (
        <ul className="divide-y divide-slate-200 rounded-md border border-slate-200 text-sm">
          {visible.map((u) => (
            <li
              key={u.id}
              className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <span className="min-w-0 wrap-anywhere">
                Recorded {formatDateTime(u.recorded_at)}
                {u.note ? ` — ${u.note}` : ''}
                {!fixedRequestId && u.request_id && titleOf(u.request_id)
                  ? ` (request: ${titleOf(u.request_id)})`
                  : ''}
              </span>
              {!archived && (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={busy || !online}
                  onClick={() => void onUndo(u.id)}
                  aria-label={`Undo revision recorded ${formatDateTime(u.recorded_at)}`}
                >
                  Undo
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
