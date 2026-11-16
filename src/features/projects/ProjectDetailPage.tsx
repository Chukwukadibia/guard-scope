import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { Pencil } from 'lucide-react';
import { Alert } from '../../components/ui/Alert';
import { Button, Spinner } from '../../components/ui/Button';
import {
  getProject,
  updateProject,
  type Project,
  type ProjectStatus,
} from '../../lib/api/projects';
import { getProjectScope, type ProjectScope } from '../../lib/api/scope';
import { errorMessages, toApiError, type ApiErrorCode } from '../../lib/api/errors';
import {
  formatDate,
  formatDateTime,
  formatMoney,
  revisionAllowanceLabel,
} from '../../lib/domain/format';
import { useOnline } from '../../hooks/useOnline';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { StatusBadge } from './StatusBadge';
import { ScopeView } from '../scope/ScopeView';
import { DraftEditor } from '../scope/DraftEditor';
import { RequestsSection } from '../requests/RequestsSection';
import { RevisionsPanel } from '../requests/RevisionsPanel';
import { ChangeProposalsSection } from '../changes/ChangeProposalsSection';
import type { RequestListItem } from '../../lib/api/requests';

const statusActions: Record<
  ProjectStatus,
  { to: ProjectStatus; label: string; variant: 'primary' | 'secondary' }[]
> = {
  active: [
    { to: 'completed', label: 'Mark completed', variant: 'secondary' },
    { to: 'archived', label: 'Archive', variant: 'secondary' },
  ],
  completed: [
    { to: 'active', label: 'Reopen', variant: 'secondary' },
    { to: 'archived', label: 'Archive', variant: 'secondary' },
  ],
  archived: [{ to: 'active', label: 'Reopen', variant: 'primary' }],
};

const countLabel = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`;

const statusMessages: Record<ProjectStatus, string> = {
  active: 'Project reopened.',
  completed: 'Project marked as completed.',
  archived: 'Project archived. It is read-only until you reopen it.',
};

export function ProjectDetailPage() {
  const { id = '' } = useParams();
  const location = useLocation();
  const online = useOnline();
  const [project, setProject] = useState<Project | null>(null);
  const [requests, setRequests] = useState<RequestListItem[]>([]);
  const [scope, setScope] = useState<ProjectScope | null>(null);
  const [loadError, setLoadError] = useState<ApiErrorCode | null>(null);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(() => {
    const saved = (location.state as { saved?: string } | null)?.saved;
    return saved
      ? { tone: 'success', text: saved === 'created' ? 'Project created.' : 'Project updated.' }
      : null;
  });
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  useDocumentTitle(project ? project.title : 'Project');

  const reloadScope = useCallback(async () => {
    setScope(await getProjectScope(id));
  }, [id]);

  // The "saved" notice is one-shot: history state survives reloads, so clear it once it has been
  // read into `notice`. replace keeps the back button pointing at the previous page.
  const hasSavedState = Boolean((location.state as { saved?: string } | null)?.saved);
  useEffect(() => {
    if (hasSavedState) navigate(location.pathname, { replace: true, state: null });
  }, [hasSavedState, location.pathname, navigate]);

  useEffect(() => {
    let active = true;
    Promise.all([getProject(id), getProjectScope(id)])
      .then(([p, s]) => {
        if (!active) return;
        setProject(p);
        setScope(s);
      })
      .catch((e) => active && setLoadError(toApiError(e).code));
    return () => {
      active = false;
    };
  }, [id]);

  async function changeStatus(to: ProjectStatus) {
    if (!project || busy) return;
    setBusy(true);
    setNotice(null);
    try {
      setProject(await updateProject(project.id, { status: to }));
      setNotice({ tone: 'success', text: statusMessages[to] });
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
          {loadError === 'not_found' ? 'Project not found' : 'Something went wrong'}
        </h1>
        <Alert tone="error">{errorMessages[loadError]}</Alert>
        <Link to="/projects" className="text-sm text-brand-700 underline">
          Back to projects
        </Link>
      </div>
    );
  }
  if (!project || !scope) return <Spinner label="Loading project…" />;

  const archived = project.status === 'archived';
  const { baseline, current, draft } = scope;
  const termsChanged =
    baseline &&
    (baseline.agreed_price !== project.agreed_price ||
      baseline.currency !== project.currency ||
      baseline.deadline !== project.deadline);

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <Link to="/projects" className="text-sm text-brand-700 underline">
          ← All projects
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="wrap-anywhere text-2xl font-semibold text-slate-900">{project.title}</h1>
            <p className="wrap-anywhere text-slate-600">Client: {project.client_name}</p>
          </div>
          <StatusBadge status={project.status} />
        </div>
        <div className="flex flex-wrap gap-2">
          {!archived && (
            <Link
              to={`/projects/${project.id}/edit`}
              className="inline-flex min-h-11 items-center gap-2 rounded-md border border-slate-300 bg-white px-4 text-sm font-medium text-slate-800 hover:bg-slate-50"
            >
              <Pencil aria-hidden="true" className="h-4 w-4" />
              Edit project
            </Link>
          )}
          {statusActions[project.status].map((a) => (
            <Button
              key={a.to}
              variant={a.variant}
              busy={busy}
              disabled={!online}
              onClick={() => void changeStatus(a.to)}
            >
              {a.label}
            </Button>
          ))}
        </div>
        {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}
        {archived && (
          <Alert tone="info">
            This project is archived and read-only. Reopen it to make changes.
          </Alert>
        )}
      </div>

      <section
        aria-labelledby="overview-heading"
        className="rounded-lg border border-slate-200 bg-white p-4 sm:p-6"
      >
        <h2 id="overview-heading" className="text-lg font-semibold">
          Overview
        </h2>
        <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-slate-600">Agreed price (current)</dt>
            <dd className="font-medium">{formatMoney(project.agreed_price, project.currency)}</dd>
          </div>
          <div>
            <dt className="text-slate-600">Currency</dt>
            <dd className="font-medium">{project.currency}</dd>
          </div>
          <div>
            <dt className="text-slate-600">Start date</dt>
            <dd className="font-medium">{formatDate(project.start_date)}</dd>
          </div>
          <div>
            <dt className="text-slate-600">Deadline (current)</dt>
            <dd className="font-medium">{formatDate(project.deadline)}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-slate-600">Client contact</dt>
            <dd className="wrap-anywhere font-medium">
              {project.client_contact ?? 'Not recorded'}
            </dd>
          </div>
          {project.description && (
            <div className="sm:col-span-2">
              <dt className="text-slate-600">Description</dt>
              <dd className="whitespace-pre-wrap wrap-anywhere">{project.description}</dd>
            </div>
          )}
          <div className="sm:col-span-2">
            <dt className="text-slate-600">Original scope</dt>
            <dd className="font-medium">
              {baseline
                ? `Confirmed ${formatDateTime(baseline.confirmed_at)} · ${countLabel(baseline.scope_items.filter((i) => i.kind === 'deliverable').length, 'deliverable')}, ${countLabel(baseline.scope_items.filter((i) => i.kind === 'exclusion').length, 'exclusion')} · Revisions: ${revisionAllowanceLabel(baseline.revision_allowance_type, baseline.revision_allowance_count)}`
                : 'Not confirmed yet'}
            </dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby="scope-heading" className="space-y-6">
        <h2 id="scope-heading" className="text-lg font-semibold">
          Scope
        </h2>

        {baseline ? (
          <article
            aria-labelledby="baseline-heading"
            className="rounded-lg border-2 border-brand-600 bg-white p-4 sm:p-6"
          >
            <h3 id="baseline-heading" className="text-base font-semibold">
              Original agreement{' '}
              <span className="font-normal text-slate-600">
                (baseline, version {baseline.version_no})
              </span>
            </h3>
            <p className="mb-4 text-sm text-slate-600">
              Confirmed {formatDateTime(baseline.confirmed_at)}. This record cannot be changed.
            </p>
            {termsChanged && (
              <div className="mb-4">
                <Alert tone="info">
                  The project&apos;s current price or deadline differs from the original agreement.
                  The values below are the ones originally agreed.
                </Alert>
              </div>
            )}
            <ScopeView version={baseline} />
          </article>
        ) : (
          <Alert tone="info">
            No original scope confirmed yet. Record what you agreed below, then confirm it to create
            the baseline.
          </Alert>
        )}

        {current && baseline && current.id !== baseline.id && (
          <article
            aria-labelledby="current-heading"
            className="rounded-lg border border-slate-300 bg-white p-4 sm:p-6"
          >
            <h3 id="current-heading" className="text-base font-semibold">
              Current scope{' '}
              <span className="font-normal text-slate-600">(version {current.version_no})</span>
            </h3>
            <p className="mb-4 text-sm text-slate-600">
              Confirmed {formatDateTime(current.confirmed_at)}.
            </p>
            <ScopeView version={current} />
          </article>
        )}

        {draft && !archived && (
          <article
            aria-labelledby="draft-heading"
            className="rounded-lg border border-dashed border-slate-400 bg-white p-4 sm:p-6"
          >
            <h3 id="draft-heading" className="text-base font-semibold">
              {baseline ? 'Draft changes' : 'Draft scope'}{' '}
              <span className="font-normal text-slate-600">(not confirmed)</span>
            </h3>
            <p className="mb-4 text-sm text-slate-600">
              {baseline
                ? 'Edit here to record an updated scope. Confirming creates a new version; the original agreement stays unchanged.'
                : 'Changes are saved as a draft until you confirm.'}
            </p>
            <DraftEditor
              key={draft.id}
              draft={draft}
              hasBaseline={Boolean(baseline)}
              onChanged={reloadScope}
              onConfirmed={async () => {
                await reloadScope();
                setNotice({
                  tone: 'success',
                  text: baseline
                    ? 'New scope version confirmed.'
                    : 'Original scope confirmed and saved as the baseline.',
                });
                document.getElementById('baseline-heading')?.scrollIntoView?.({ block: 'start' });
              }}
            />
          </article>
        )}
      </section>

      <RequestsSection projectId={project.id} archived={archived} onChanged={setRequests} />
      <ChangeProposalsSection projectId={project.id} />
      <RevisionsPanel
        projectId={project.id}
        currentScope={current}
        archived={archived}
        requests={requests}
      />
    </div>
  );
}
