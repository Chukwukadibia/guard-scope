import { FolderKanban } from 'lucide-react';
import { EmptyState } from '../../components/ui/Alert';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';

export function ProjectsPage() {
  useDocumentTitle('Projects');
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-slate-900">Projects</h1>
      <EmptyState
        title="Projects will appear here"
        icon={<FolderKanban className="h-10 w-10" aria-hidden="true" />}
      >
        <p>Each project will hold your original agreement, client requests and change approvals.</p>
      </EmptyState>
    </div>
  );
}
