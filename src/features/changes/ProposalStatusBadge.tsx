import {
  CircleCheck,
  CircleDashed,
  CircleHelp,
  CircleSlash,
  CircleX,
  Clock,
  History,
} from 'lucide-react';
import { proposalStatusLabel, type ProposalStatus } from '../../lib/domain/changeOrder';

const styles: Record<ProposalStatus, { cls: string; Icon: typeof Clock }> = {
  draft: { cls: 'border-slate-300 bg-white text-slate-700', Icon: CircleDashed },
  pending: { cls: 'border-sky-200 bg-sky-50 text-sky-950', Icon: Clock },
  approved: { cls: 'border-green-200 bg-green-50 text-green-900', Icon: CircleCheck },
  declined: { cls: 'border-slate-300 bg-slate-100 text-slate-800', Icon: CircleX },
  clarification_requested: { cls: 'border-amber-200 bg-amber-50 text-amber-950', Icon: CircleHelp },
  cancelled: { cls: 'border-slate-300 bg-slate-100 text-slate-700', Icon: CircleSlash },
  superseded: { cls: 'border-slate-300 bg-slate-100 text-slate-700', Icon: History },
};

/** Text + icon, never colour alone; calm styling for ordinary states (PRD §8, §12). */
export function ProposalStatusBadge({ status }: { status: ProposalStatus }) {
  const { cls, Icon } = styles[status];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${cls}`}
    >
      <Icon aria-hidden="true" className="h-3.5 w-3.5" />
      {proposalStatusLabel[status]}
    </span>
  );
}
