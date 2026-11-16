import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Pencil } from 'lucide-react';
import { Alert } from '../../components/ui/Alert';
import { Button, Spinner } from '../../components/ui/Button';
import { getProject, type Project } from '../../lib/api/projects';
import { getProjectScope, type ProjectScope } from '../../lib/api/scope';
import {
  classifyRequest,
  getRequest,
  listRequests,
  updateRequest,
  type ClientRequest,
  type RequestListItem,
} from '../../lib/api/requests';
import { listEntityEvents, type ActivityEvent } from '../../lib/api/activity';
import { errorMessages, toApiError, type ApiErrorCode } from '../../lib/api/errors';
import { formatDate, formatDateTime } from '../../lib/domain/format';
import {
  channelLabel,
  classificationExplainer,
  classificationLabel,
  type Classification,
} from '../../lib/domain/request';
import { useOnline } from '../../hooks/useOnline';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { ClassificationBadge } from './ClassificationBadge';
import { RequestForm } from './RequestForm';
import { RevisionsPanel } from './RevisionsPanel';
import { RequestHistoryList } from './RequestHistory';
import { ItemList } from '../scope/ScopeView';

const options: Exclude<Classification, 'unclassified'>[] = [
  'included',
  'additional',
  'needs_clarification',
];

export function RequestDetailPage() {
  const { id = '', requestId = '' } = useParams();
  const online = useOnline();
  const [project, setProject] = useState<Project | null>(null);
  const [scope, setScope] = useState<ProjectScope | null>(null);
  const [request, setRequest] = useState<ClientRequest | null>(null);
  const [allRequests, setAllRequests] = useState<RequestListItem[]>([]);
  const [events, setEvents] = useState<ActivityEvent[] | null>(null);
  const [loadError, setLoadError] = useState<ApiErrorCode | null>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  useDocumentTitle(request ? request.title : 'Request');

  const loadEvents = useCallback(async () => {
    setEvents(await listEntityEvents('request', requestId));
  }, [requestId]);

  useEffect(() => {
    let active = true;
    Promise.all([
      getProject(id),
      getRequest(id, requestId),
      getProjectScope(id),
      listRequests(id),
      listEntityEvents('request', requestId),
    ])
      .then(([p, r, s, all, ev]) => {
        if (!active) return;
        setProject(p);
        setRequest(r);
        setScope(s);
        setAllRequests(all);
        setEvents(ev);
      })
      .catch((e) => active && setLoadError(toApiError(e).code));
    return () => {
      active = false;
    };
  }, [id, requestId]);

  async function classify(value: Exclude<Classification, 'unclassified'>) {
    if (!request || busy || request.classification === value) return;
    setBusy(true);
    setNotice(null);
    try {
      const updated = await classifyRequest(request.id, value);
      setRequest(updated);
      await loadEvents(); // history first, then confirm, so the announcement matches what's on screen
      setNotice({ tone: 'success', text: `Marked as ${classificationLabel[value]}.` });
    } catch (e) {
      setNotice({ tone: 'error', text: errorMessages[toApiError(e).code] });
    } finally {
      setBusy(false);
    }
  }

  if (loadError) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold text-slate-900">
          {loadError === 'not_found' ? 'Request not found' : 'Something went wrong'}
        </h1>
        <Alert tone="error">{errorMessages[loadError]}</Alert>
        <Link to={`/projects/${id}`} className="text-sm text-brand-700 underline">
          Back to the project
        </Link>
      </div>
    );
  }
  if (!project || !request || !scope) return <Spinner label="Loading request…" />;

  const archived = project.status === 'archived';
  const reference = scope.current;

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <Link to={`/projects/${project.id}#requests`} className="text-sm text-brand-700 underline">
          ← {project.title}
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold text-slate-900 wrap-anywhere">{request.title}</h1>
            <p className="text-slate-600">
              Received {formatDate(request.received_on)}
              {request.source_channel ? ` via ${channelLabel[request.source_channel]}` : ''}
            </p>
          </div>
          <ClassificationBadge value={request.classification} />
        </div>
        {archived && (
          <Alert tone="info">
            This project is archived. Requests are read-only until you reopen it.
          </Alert>
        )}
        {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}
      </div>

      <section
        aria-labelledby="request-details-heading"
        className="space-y-4 rounded-lg border border-slate-200 bg-white p-4 sm:p-6"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="request-details-heading" className="text-lg font-semibold">
            Request details
          </h2>
          {!archived && !editing && (
            <Button variant="secondary" onClick={() => setEditing(true)}>
              <Pencil aria-hidden="true" className="h-4 w-4" />
              Edit request
            </Button>
          )}
        </div>
        {editing ? (
          <RequestForm
            idPrefix="edit-request"
            initial={{
              title: request.title,
              description: request.description ?? '',
              source_channel: request.source_channel ?? '',
              received_on: request.received_on,
              internal_notes: request.internal_notes ?? '',
            }}
            submitLabel="Save changes"
            onCancel={() => setEditing(false)}
            onSubmit={async (input) => {
              setRequest(await updateRequest(request.id, input));
              setEditing(false);
              setNotice({ tone: 'success', text: 'Request updated.' });
            }}
          />
        ) : (
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-slate-600">Details</dt>
              <dd className="whitespace-pre-wrap wrap-anywhere">
                {request.description ?? 'None recorded.'}
              </dd>
            </div>
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
              <dt className="font-medium text-slate-800">Private notes</dt>
              <dd className="mt-0.5 text-xs text-slate-600">
                Private — never shown to your client.
              </dd>
              <dd className="mt-1 whitespace-pre-wrap wrap-anywhere">
                {request.internal_notes ?? 'None.'}
              </dd>
            </div>
          </dl>
        )}
      </section>

      <section
        aria-labelledby="compare-heading"
        className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 sm:p-6"
      >
        <h2 id="compare-heading" className="text-lg font-semibold">
          Compare with your recorded scope
        </h2>
        {reference ? (
          <>
            <p className="text-sm text-slate-600">
              {reference.is_original_baseline
                ? 'Original agreement'
                : `Current scope (version ${reference.version_no})`}
              , confirmed {formatDateTime(reference.confirmed_at)}.
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <ItemList version={reference} kind="deliverable" headingLevel={3} />
              <ItemList version={reference} kind="exclusion" headingLevel={3} />
            </div>
          </>
        ) : (
          <Alert tone="info">
            No scope has been confirmed for this project yet, so there is nothing to compare
            against.
          </Alert>
        )}
      </section>

      <section
        aria-labelledby="classify-heading"
        className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 sm:p-6"
      >
        <h2 id="classify-heading" className="text-lg font-semibold">
          Your decision
        </h2>
        <p className="text-sm text-slate-600">
          You decide how this request relates to the agreement. GuardScope doesn&apos;t make legal
          judgements.
        </p>
        <div role="group" aria-label="Classify this request" className="flex flex-wrap gap-2">
          {options.map((o) => (
            <button
              key={o}
              type="button"
              aria-pressed={request.classification === o}
              disabled={archived || busy || !online}
              onClick={() => void classify(o)}
              className={`inline-flex min-h-11 items-center rounded-md border px-4 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60 ${
                request.classification === o
                  ? 'border-brand-600 bg-brand-50 text-brand-800'
                  : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-50'
              }`}
            >
              {classificationLabel[o]}
            </button>
          ))}
        </div>
        {request.classification !== 'unclassified' && (
          <p className="text-sm">{classificationExplainer[request.classification]}</p>
        )}
      </section>

      {request.classification === 'included' && (
        <RevisionsPanel
          projectId={project.id}
          currentScope={scope.current}
          archived={archived}
          requests={allRequests}
          fixedRequestId={request.id}
        />
      )}

      <section
        aria-labelledby="history-heading"
        className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 sm:p-6"
      >
        <h2 id="history-heading" className="text-lg font-semibold">
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
