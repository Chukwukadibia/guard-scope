import { CircleHelp, CirclePlus, CircleCheck, CircleDashed } from 'lucide-react';
import { classificationLabel, type Classification } from '../../lib/domain/request';

const styles: Record<Classification, { cls: string; Icon: typeof CircleHelp }> = {
  unclassified: { cls: 'border-slate-300 bg-white text-slate-700', Icon: CircleDashed },
  included: { cls: 'border-green-200 bg-green-50 text-green-900', Icon: CircleCheck },
  additional: { cls: 'border-amber-200 bg-amber-50 text-amber-950', Icon: CirclePlus },
  needs_clarification: { cls: 'border-sky-200 bg-sky-50 text-sky-950', Icon: CircleHelp },
};

/** Text + icon, never colour alone (PRD §12). Neutral styling: no alarming treatment (PRD §8). */
export function ClassificationBadge({ value }: { value: Classification }) {
  const { cls, Icon } = styles[value];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${cls}`}
    >
      <Icon aria-hidden="true" className="h-3.5 w-3.5" />
      {classificationLabel[value]}
    </span>
  );
}
