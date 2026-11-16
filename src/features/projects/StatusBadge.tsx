import { Archive, CheckCircle2, CircleDot } from 'lucide-react';
import type { ProjectStatus } from '../../lib/api/projects';
import { statusLabel } from '../../lib/domain/format';

const styles: Record<ProjectStatus, { cls: string; Icon: typeof Archive }> = {
  active: { cls: 'bg-brand-50 text-brand-800 border-brand-100', Icon: CircleDot },
  completed: { cls: 'bg-slate-100 text-slate-800 border-slate-200', Icon: CheckCircle2 },
  archived: { cls: 'bg-slate-100 text-slate-700 border-slate-200', Icon: Archive },
};

/** Status is conveyed by text and icon, not colour alone (PRD §12). */
export function StatusBadge({ status }: { status: ProjectStatus }) {
  const { cls, Icon } = styles[status];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${cls}`}
    >
      <Icon aria-hidden="true" className="h-3.5 w-3.5" />
      {statusLabel[status]}
    </span>
  );
}
