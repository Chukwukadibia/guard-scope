import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FolderOpen } from 'lucide-react';
import { Alert, EmptyState } from '../../components/ui/Alert';
import { Spinner } from '../../components/ui/Button';
import { listProjects, type Project } from '../../lib/api/projects';
import { errorMessages, toApiError } from '../../lib/api/errors';
import { formatDate } from '../../lib/domain/format';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { NewProjectLink } from '../projects/ProjectsPage';

/** PRD §8. Pending decisions and approved additional value arrive with Phases 5–6. */
export function DashboardPage() {
  useDocumentTitle('Dashboard');
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    listProjects(['active'])
      .then((p) => active && setProjects(p))
      .catch((e) => active && setError(errorMessages[toApiError(e).code]));
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-slate-900">Dashboard</h1>
        <NewProjectLink />
      </div>
      {error && <Alert tone="error">{error}</Alert>}
      {!error && projects === null && <Spinner label="Loading dashboard…" />}
      {projects && (
        <>
          <section
            aria-labelledby="active-count-heading"
            className="rounded-lg border border-slate-200 bg-white p-4 sm:p-6"
          >
            <h2 id="active-count-heading" className="text-sm font-medium text-slate-600">
              Active projects
            </h2>
            <p
              className="mt-1 text-3xl font-semibold text-slate-900"
              data-testid="active-project-count"
            >
              {projects.length}
            </p>
          </section>
          {projects.length === 0 ? (
            <EmptyState
              title="No projects yet"
              icon={<FolderOpen className="h-10 w-10" aria-hidden="true" />}
            >
              <p>Create your first project to record what you agreed with your client.</p>
            </EmptyState>
          ) : (
            <section aria-labelledby="recent-heading" className="space-y-3">
              <h2 id="recent-heading" className="text-lg font-semibold">
                Recently updated
              </h2>
              <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
                {projects.slice(0, 5).map((p) => (
                  <li key={p.id}>
                    <Link
                      to={`/projects/${p.id}`}
                      className="flex flex-wrap items-center justify-between gap-2 p-4 hover:bg-slate-50"
                    >
                      <span className="min-w-0">
                        <span className="block break-words font-medium text-slate-900">
                          {p.title}
                        </span>
                        <span className="block break-words text-sm text-slate-600">
                          {p.client_name}
                        </span>
                      </span>
                      <span className="text-sm text-slate-600">
                        Deadline: {formatDate(p.deadline)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              {projects.length > 5 && (
                <Link to="/projects" className="text-sm text-brand-700 underline">
                  View all active projects
                </Link>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}
