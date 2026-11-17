import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileText } from 'lucide-react';
import { Alert, EmptyState } from '../../components/ui/Alert';
import { Spinner } from '../../components/ui/Button';
import { listChangeOrders, type ChangeOrder } from '../../lib/api/changeOrders';
import { errorMessages, toApiError } from '../../lib/api/errors';
import { formatPriceImpact, formatTimeImpact, headerVersion } from '../../lib/domain/changeOrder';
import { ProposalStatusBadge } from './ProposalStatusBadge';

export function ChangeProposalsSection({
  projectId,
  projectActive,
}: {
  projectId: string;
  projectActive: boolean;
}) {
  const [items, setItems] = useState<ChangeOrder[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    listChangeOrders(projectId)
      .then((c) => active && setItems(c))
      .catch((e) => active && setError(errorMessages[toApiError(e).code]));
    return () => {
      active = false;
    };
  }, [projectId]);

  return (
    <section
      aria-labelledby="changes-heading"
      id="changes"
      className="space-y-4 rounded-lg border border-slate-200 bg-white p-4 sm:p-6"
    >
      <h2 id="changes-heading" className="text-lg font-semibold">
        Change proposals
      </h2>
      {error && <Alert tone="error">{error}</Alert>}
      {!error && items === null && <Spinner label="Loading change proposals…" />}
      {items && items.length === 0 && (
        <EmptyState
          title="No change proposals yet"
          icon={<FileText className="h-10 w-10" aria-hidden="true" />}
        >
          <p>Mark a request as Additional, then create a change proposal from it.</p>
        </EmptyState>
      )}
      {items && items.length > 0 && (
        <ul className="divide-y divide-slate-200 rounded-md border border-slate-200">
          {items.map((co) => {
            // Same version the proposal page header shows (ISS-021): no hidden draft on closed projects.
            const v = headerVersion(co, projectActive);
            if (!v) return null;
            return (
              <li key={co.id}>
                <Link
                  to={`/projects/${projectId}/changes/${co.id}`}
                  className="flex flex-col gap-1 p-3 hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between"
                >
                  <span className="min-w-0">
                    <span className="block font-medium text-slate-900 wrap-anywhere">
                      {v.title}
                    </span>
                    <span className="block text-sm text-slate-600">
                      Version {v.version_no} · Proposed:{' '}
                      {formatPriceImpact(v.price_impact, v.currency)},{' '}
                      {formatTimeImpact(v.time_impact_value, v.time_impact_unit)}
                    </span>
                  </span>
                  <ProposalStatusBadge status={v.status} />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
