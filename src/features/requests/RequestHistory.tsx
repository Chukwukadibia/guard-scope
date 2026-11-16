import type { ActivityEvent } from '../../lib/api/activity';
import { formatDateTime } from '../../lib/domain/format';
import { classificationTransition } from '../../lib/domain/request';

/** A request's history list (REQ-003, AC-3): summary, "from → to" for classifications, time. */
export function RequestHistoryList({ events }: { events: ActivityEvent[] }) {
  return (
    <ol className="space-y-2 text-sm">
      {events.map((ev) => {
        const change = classificationTransition(ev.event_type, ev.metadata);
        return (
          <li key={ev.id} className="flex flex-col gap-0.5 border-l-2 border-slate-300 pl-3">
            <span className="wrap-anywhere">{ev.summary}</span>
            {change && (
              <span className="text-slate-700 wrap-anywhere">
                <span className="sr-only">Changed from </span>
                {change.from} <span aria-hidden="true">→</span>
                <span className="sr-only"> to</span> {change.to}
              </span>
            )}
            <span className="text-xs text-slate-600">{formatDateTime(ev.created_at)}</span>
          </li>
        );
      })}
    </ol>
  );
}
