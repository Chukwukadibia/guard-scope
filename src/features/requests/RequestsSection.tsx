import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Inbox } from 'lucide-react';
import { Alert, EmptyState } from '../../components/ui/Alert';
import { Button, Spinner } from '../../components/ui/Button';
import { createRequest, listRequests, type RequestListItem } from '../../lib/api/requests';
import { errorMessages, toApiError } from '../../lib/api/errors';
import { formatDate } from '../../lib/domain/format';
import {
  channelLabel,
  classificationLabel,
  emptyRequest,
  type Classification,
} from '../../lib/domain/request';
import { ClassificationBadge } from './ClassificationBadge';
import { RequestForm } from './RequestForm';

type Filter = 'all' | Classification;
const filters: Filter[] = ['all', 'unclassified', 'included', 'additional', 'needs_clarification'];

export function RequestsSection({
  projectId,
  archived,
  onChanged,
}: {
  projectId: string;
  archived: boolean;
  onChanged?: (requests: RequestListItem[]) => void;
}) {
  const [requests, setRequests] = useState<RequestListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [notice, setNotice] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);

  const load = useCallback(async () => {
    try {
      const r = await listRequests(projectId);
      setRequests(r);
      setError(null);
      onChanged?.(r);
    } catch (e) {
      setError(errorMessages[toApiError(e).code]);
    }
  }, [projectId, onChanged]);

  useEffect(() => {
    void load();
  }, [load]);

  const shown = (requests ?? []).filter((r) => filter === 'all' || r.classification === filter);
  const count = (f: Filter) =>
    (requests ?? []).filter((r) => f === 'all' || r.classification === f).length;

  return (
    <section
      aria-labelledby="requests-heading"
      id="requests"
      className="space-y-4 rounded-lg border border-slate-200 bg-white p-4 sm:p-6"
    >
      <h2 id="requests-heading" className="text-lg font-semibold">
        Client requests
      </h2>

      {!archived && (
        <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
          <h3 className="mb-3 text-base font-semibold">Log a new request</h3>
          <RequestForm
            key={formKey}
            idPrefix="new-request"
            initial={emptyRequest()}
            submitLabel="Save request"
            compact
            onSubmit={async (input) => {
              const created = await createRequest(projectId, input);
              setNotice(`Request "${created.title}" saved. Open it to classify it.`);
              setFormKey((k) => k + 1);
              await load();
            }}
          />
          {notice && (
            <div className="mt-3">
              <Alert tone="success">{notice}</Alert>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="space-y-2">
          <Alert tone="error">{error}</Alert>
          <Button variant="secondary" onClick={() => void load()}>
            Try again
          </Button>
        </div>
      )}
      {!error && requests === null && <Spinner label="Loading requests…" />}
      {requests && requests.length === 0 && (
        <EmptyState
          title="No requests yet"
          icon={<Inbox className="h-10 w-10" aria-hidden="true" />}
        >
          <p>
            When your client asks for something, log it here and decide whether it&apos;s included
            or additional.
          </p>
        </EmptyState>
      )}
      {requests && requests.length > 0 && (
        <>
          <div
            role="group"
            aria-label="Filter requests by classification"
            className="flex flex-wrap gap-2"
          >
            {filters.map((f) => (
              <button
                key={f}
                type="button"
                aria-pressed={filter === f}
                onClick={() => setFilter(f)}
                className={`inline-flex min-h-11 items-center rounded-md border px-3 text-sm font-medium ${
                  filter === f
                    ? 'border-brand-600 bg-brand-50 text-brand-800'
                    : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                {f === 'all' ? 'All' : classificationLabel[f]} ({count(f)})
              </button>
            ))}
          </div>
          {shown.length === 0 ? (
            <p className="text-sm text-slate-600">No requests match this filter.</p>
          ) : (
            <ul className="divide-y divide-slate-200 rounded-md border border-slate-200">
              {shown.map((r) => (
                <li key={r.id}>
                  <Link
                    to={`/projects/${projectId}/requests/${r.id}`}
                    className="flex flex-col gap-1 p-3 hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <span className="min-w-0">
                      <span className="block font-medium text-slate-900 wrap-anywhere">
                        {r.title}
                      </span>
                      <span className="block text-sm text-slate-600">
                        Received {formatDate(r.received_on)}
                        {r.source_channel ? ` · via ${channelLabel[r.source_channel]}` : ''}
                      </span>
                    </span>
                    <ClassificationBadge value={r.classification} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
