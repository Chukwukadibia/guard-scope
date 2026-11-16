import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { FolderKanban, Plus } from 'lucide-react';
import { Alert, EmptyState } from '../../components/ui/Alert';
import { Button, Spinner } from '../../components/ui/Button';
import { listProjects, type Project, type ProjectStatus } from '../../lib/api/projects';
import { errorMessages, toApiError } from '../../lib/api/errors';
import { formatDate, formatMoney } from '../../lib/domain/format';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { StatusBadge } from './StatusBadge';

const filters: { value: ProjectStatus; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'completed', label: 'Completed' },
  { value: 'archived', label: 'Archived' },
];

export function NewProjectLink({ className = '' }: { className?: string }) {
  return (
    <Link
      to="/projects/new"
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700 ${className}`}
    >
      <Plus aria-hidden="true" className="h-4 w-4" />
      New project
    </Link>
  );
}

export function ProjectsPage() {
  useDocumentTitle('Projects');
  const [params] = useSearchParams();
  const raw = params.get('status');
  const status: ProjectStatus = raw === 'completed' || raw === 'archived' ? raw : 'active';
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    setProjects(null);
    setError(null);
    listProjects([status])
      .then((p) => active && setProjects(p))
      .catch((e) => active && setError(errorMessages[toApiError(e).code]));
    return () => {
      active = false;
    };
  }, [status, reload]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-slate-900">Projects</h1>
        <NewProjectLink />
      </div>

      <nav aria-label="Filter projects by status">
        <ul className="flex flex-wrap gap-2">
          {filters.map((f) => (
            <li key={f.value}>
              <Link
                to={f.value === 'active' ? '/projects' : `/projects?status=${f.value}`}
                aria-current={status === f.value ? 'page' : undefined}
                className={`inline-flex min-h-11 items-center rounded-md border px-3 text-sm font-medium ${
                  status === f.value
                    ? 'border-brand-600 bg-brand-50 text-brand-800'
                    : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                {f.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {error && (
        <div className="space-y-3">
          <Alert tone="error">{error}</Alert>
          <Button variant="secondary" onClick={() => setReload((n) => n + 1)}>
            Try again
          </Button>
        </div>
      )}
      {!error && projects === null && <Spinner label="Loading projects…" />}
      {projects && projects.length === 0 && (
        <EmptyState
          title={status === 'active' ? 'No active projects' : `No ${status} projects`}
          icon={<FolderKanban className="h-10 w-10" aria-hidden="true" />}
        >
          {status === 'active' ? (
            <div className="space-y-4">
              <p>Create a project to record what you agreed with your client.</p>
              <NewProjectLink />
            </div>
          ) : (
            <p>Projects you mark as {status} will appear here.</p>
          )}
        </EmptyState>
      )}
      {projects && projects.length > 0 && (
        <ul className="grid gap-3">
          {projects.map((p) => (
            <li key={p.id}>
              <Link
                to={`/projects/${p.id}`}
                className="block rounded-lg border border-slate-200 bg-white p-4 hover:border-brand-600"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="wrap-anywhere text-base font-semibold text-slate-900">
                      {p.title}
                    </h2>
                    <p className="wrap-anywhere text-sm text-slate-600">{p.client_name}</p>
                  </div>
                  <StatusBadge status={p.status} />
                </div>
                <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                  <div className="flex gap-1">
                    <dt className="text-slate-600">Agreed price:</dt>
                    <dd className="font-medium">{formatMoney(p.agreed_price, p.currency)}</dd>
                  </div>
                  <div className="flex gap-1">
                    <dt className="text-slate-600">Deadline:</dt>
                    <dd className="font-medium">{formatDate(p.deadline)}</dd>
                  </div>
                </dl>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
