import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Alert } from '../../components/ui/Alert';
import { Button, Spinner } from '../../components/ui/Button';
import { getProject, type Project } from '../../lib/api/projects';
import {
  cancelProposalVersion,
  getChangeOrder,
  newProposalVersion,
  type ChangeOrder,
} from '../../lib/api/changeOrders';
import { headerVersion, versionCountLabel } from '../../lib/domain/changeOrder';
import { listEntityEvents, type ActivityEvent } from '../../lib/api/activity';
import { errorMessages, toApiError, type ApiErrorCode } from '../../lib/api/errors';
import { formatDateTime } from '../../lib/domain/format';
import { useOnline } from '../../hooks/useOnline';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { ProposalStatusBadge } from './ProposalStatusBadge';
import { ProposalView } from './ProposalView';
import { ProposalEditor } from './ProposalEditor';
import { RequestHistoryList } from '../requests/RequestHistory';

export function ChangeOrderPage() {
  const { id = '', changeId = '' } = useParams();
  const navigate = useNavigate();
  const online = useOnline();
  const [project, setProject] = useState<Project | null>(null);
  const [co, setCo] = useState<ChangeOrder | null>(null);
  const [events, setEvents] = useState<ActivityEvent[] | null>(null);
  const [loadError, setLoadError] = useState<ApiErrorCode | null>(null);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [cancelling, setCancelling] = useState<string | null>(null);
  // On a closed project the draft is hidden, so the header describes the newest sent version (ISS-019).
  const latest = co && project ? headerVersion(co, project.status === 'active') : undefined;
  useDocumentTitle(latest ? latest.title : 'Change proposal');

  const reload = useCallback(async () => {
    const [c, ev] = await Promise.all([
      getChangeOrder(id, changeId),
      listEntityEvents('change_order', changeId),
    ]);
    setCo(c);
    setEvents(ev);
  }, [id, changeId]);

  useEffect(() => {
    let active = true;
    Promise.all([
      getProject(id),
      getChangeOrder(id, changeId),
      listEntityEvents('change_order', changeId),
    ])
      .then(([p, c, ev]) => {
        if (!active) return;
        setProject(p);
        setCo(c);
        setEvents(ev);
      })
      .catch((e) => active && setLoadError(toApiError(e).code));
    return () => {
      active = false;
    };
  }, [id, changeId]);

  async function run(fn: () => Promise<unknown>, success: string) {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      await fn();
      await reload();
      setNotice({ tone: 'success', text: success });
    } catch (e) {
      setNotice({ tone: 'error', text: errorMessages[toApiError(e).code] });
    } finally {
      setBusy(false);
      setCancelling(null);
    }
  }

  if (loadError) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold text-slate-900">
          {loadError === 'not_found' ? 'Change proposal not found' : 'Something went wrong'}
        </h1>
        <Alert tone="error">{errorMessages[loadError]}</Alert>
        <Link to={`/projects/${id}`} className="text-sm text-brand-700 underline">
          Back to the project
        </Link>
      </div>
    );
  }
  if (!project || !co || !latest) return <Spinner label="Loading change proposal…" />;

  const active = project.status === 'active';
  const draft = co.versions.find((v) => v.status === 'draft');
  const sent = co.versions.filter((v) => v.status !== 'draft').reverse(); // newest first

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <Link to={`/projects/${project.id}#changes`} className="text-sm text-brand-700 underline">
          ← {project.title}
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold text-slate-900 wrap-anywhere">{latest.title}</h1>
            <p className="text-slate-600">
              Change proposal · {versionCountLabel(co.versions, active)}
              {co.request && (
                <>
                  {' · from request '}
                  <Link
                    to={`/projects/${project.id}/requests/${co.request.id}`}
                    className="text-brand-700 underline wrap-anywhere"
                  >
                    {co.request.title}
                  </Link>
                </>
              )}
            </p>
          </div>
          <ProposalStatusBadge status={latest.status} />
        </div>
        {!active && (
          <Alert tone="info">
            This project is {project.status}. Change proposals are read-only until you reopen the
            project.
          </Alert>
        )}
        {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}
      </div>

      {draft && active && (
        <section
          aria-labelledby="draft-heading"
          className="rounded-lg border border-dashed border-slate-400 bg-white p-4 sm:p-6"
        >
          <h2 id="draft-heading" className="mb-4 text-lg font-semibold">
            Draft version {draft.version_no}{' '}
            <span className="font-normal text-slate-600">(not sent)</span>
          </h2>
          <ProposalEditor
            key={draft.id}
            draft={draft}
            hasSentVersions={sent.length > 0}
            onChanged={async (message) => {
              await reload();
              setNotice({ tone: 'success', text: message });
            }}
            onDiscarded={async (removedWhole) => {
              if (removedWhole) {
                navigate(`/projects/${project.id}#changes`, { replace: true });
                return;
              }
              await reload();
              setNotice({ tone: 'success', text: 'Draft discarded.' });
            }}
          />
        </section>
      )}

      {!draft && active && (
        <div className="space-y-2">
          <Button
            variant="secondary"
            busy={busy}
            disabled={!online}
            onClick={() =>
              void run(
                () => newProposalVersion(co.id),
                'New draft version created from the latest version.',
              )
            }
          >
            Create a new version
          </Button>
          <p className="text-sm text-slate-600">
            Sent versions can&apos;t be edited. A new version starts as a copy of the latest one.
          </p>
        </div>
      )}

      {sent.length > 0 && (
        <section aria-labelledby="versions-heading" className="space-y-4">
          <h2 id="versions-heading" className="text-lg font-semibold">
            Sent versions
          </h2>
          {sent.map((v) => (
            <article
              key={v.id}
              aria-labelledby={`v-${v.id}`}
              className={`rounded-lg border bg-white p-4 sm:p-6 ${v.status === 'pending' ? 'border-2 border-brand-600' : 'border-slate-200'}`}
            >
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p id={`v-${v.id}`} className="font-semibold">
                  Version {v.version_no}
                </p>
                <ProposalStatusBadge status={v.status} />
              </div>
              <p className="mb-4 text-sm text-slate-600">
                Sent {formatDateTime(v.sent_at)}
                {v.status !== 'pending'
                  ? ` · status changed ${formatDateTime(v.status_changed_at)}`
                  : ''}
                . This version can&apos;t be changed.
              </p>
              <ProposalView version={v} />
              {v.status === 'pending' && active && (
                <div className="mt-4 space-y-3 border-t border-slate-200 pt-4">
                  <p className="text-sm text-slate-600">
                    Waiting for the client. Secure approval links for your client arrive in the next
                    release.
                  </p>
                  {cancelling === v.id ? (
                    <div
                      role="group"
                      aria-labelledby={`cancel-${v.id}`}
                      className="space-y-2 rounded-md border border-slate-300 p-3"
                    >
                      <p id={`cancel-${v.id}`} className="text-sm font-semibold">
                        Cancel version {v.version_no}? The record of it stays.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="secondary"
                          busy={busy}
                          disabled={!online}
                          onClick={() =>
                            void run(
                              () => cancelProposalVersion(v.id),
                              `Version ${v.version_no} cancelled.`,
                            )
                          }
                        >
                          Yes, cancel it
                        </Button>
                        <Button variant="ghost" onClick={() => setCancelling(null)}>
                          Keep it
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button
                      variant="ghost"
                      disabled={!online || busy}
                      onClick={() => setCancelling(v.id)}
                    >
                      Cancel this proposal…
                    </Button>
                  )}
                </div>
              )}
            </article>
          ))}
        </section>
      )}

      <section
        aria-labelledby="co-history-heading"
        className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 sm:p-6"
      >
        <h2 id="co-history-heading" className="text-lg font-semibold">
          History
        </h2>
        {events === null ? (
          <Spinner label="Loading history…" />
        ) : events.length === 0 ? (
          <p className="text-sm text-slate-600">No history yet.</p>
        ) : (
          <RequestHistoryList events={events} />
        )}
      </section>
    </div>
  );
}
