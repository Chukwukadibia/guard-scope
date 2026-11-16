import { FolderOpen } from 'lucide-react';
import { EmptyState } from '../../components/ui/Alert';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';

/** Phase 1: empty state only. Project counts, pending decisions and the create-project
 *  action arrive with Phase 2 (D-P1-6). */
export function DashboardPage() {
  useDocumentTitle('Dashboard');
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-slate-900">Dashboard</h1>
      <EmptyState
        title="No projects yet"
        icon={<FolderOpen className="h-10 w-10" aria-hidden="true" />}
      >
        <p>
          GuardScope will show your active projects, pending client decisions and approved
          additional work here. Project creation is coming in the next release.
        </p>
      </EmptyState>
    </div>
  );
}
