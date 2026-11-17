import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { createChangeOrder, findChangeOrderForRequest } from '../../lib/api/changeOrders';
import { errorMessages, toApiError } from '../../lib/api/errors';
import type { Classification } from '../../lib/domain/request';
import { headerStatus, type ProposalStatus } from '../../lib/domain/changeOrder';
import { useOnline } from '../../hooks/useOnline';
import { ProposalStatusBadge } from './ProposalStatusBadge';

/** On the request page: create the change proposal for an Additional request, or link to the existing one. */
export function RequestProposalPanel({
  projectId,
  requestId,
  classification,
  projectActive,
}: {
  projectId: string;
  requestId: string;
  classification: Classification;
  projectActive: boolean;
}) {
  const navigate = useNavigate();
  const online = useOnline();
  const [existing, setExisting] = useState<
    { id: string; versions: { version_no: number; status: ProposalStatus }[] } | null | undefined
  >(undefined);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    findChangeOrderForRequest(requestId)
      .then((c) => active && setExisting(c))
      .catch((e) => active && setError(errorMessages[toApiError(e).code]));
    return () => {
      active = false;
    };
  }, [requestId]);

  if (existing === undefined && !error) return null;
  if (!existing && classification !== 'additional') return null;

  async function create() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const id = await createChangeOrder(requestId);
      navigate(`/projects/${projectId}/changes/${id}`);
    } catch (e) {
      setError(errorMessages[toApiError(e).code]);
      setBusy(false);
    }
  }

  return (
    <section
      aria-labelledby="proposal-panel-heading"
      className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 sm:p-6"
    >
      <h2 id="proposal-panel-heading" className="text-lg font-semibold">
        Change proposal
      </h2>
      {error && <Alert tone="error">{error}</Alert>}
      {existing ? (
        <div className="flex flex-wrap items-center gap-3">
          <Link
            to={`/projects/${projectId}/changes/${existing.id}`}
            className="text-brand-700 underline"
          >
            Open the change proposal
          </Link>
          <ProposalStatusBadge status={headerStatus(existing.versions, projectActive)} />
        </div>
      ) : projectActive ? (
        <>
          <p className="text-sm text-slate-600">
            Turn this request into a priced and/or timed proposal for your client.
          </p>
          <Button busy={busy} disabled={!online} onClick={() => void create()}>
            Create change proposal
          </Button>
        </>
      ) : (
        <p className="text-sm text-slate-600">Reopen the project to create a change proposal.</p>
      )}
    </section>
  );
}
