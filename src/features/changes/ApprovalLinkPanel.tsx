import { useRef, useState } from 'react';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import {
  revokeApprovalLink,
  type ApprovalLink,
  type ClientDecisionRow,
} from '../../lib/api/changeOrders';
import { errorMessages, toApiError } from '../../lib/api/errors';
import { issueLink, type IssuedLink } from './issueLink';
import { formatDate, formatDateTime } from '../../lib/domain/format';
import { linkStatus, linkStatusLabel, ownerDecisionText } from '../../lib/domain/publicLink';

/** Shown once. The link lives in component state only and disappears on navigation or refresh. */
export function IssuedLinkBox({ link, versionNo }: { link: IssuedLink; versionNo: number }) {
  const field = useRef<HTMLInputElement>(null);
  const [copy, setCopy] = useState<'idle' | 'copied' | 'manual'>('idle');

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(link.url);
      setCopy('copied');
    } catch {
      field.current?.focus();
      field.current?.select();
      setCopy('manual');
    }
  }

  return (
    <div
      role="group"
      aria-labelledby={`issued-${versionNo}`}
      className="space-y-3 rounded-lg border-2 border-brand-600 bg-brand-50 p-4"
    >
      <h3 id={`issued-${versionNo}`} className="font-semibold">
        Link for version {versionNo}
      </h3>
      <label htmlFor={`issued-url-${versionNo}`} className="block text-sm font-medium">
        Share this link with your client
      </label>
      <input
        id={`issued-url-${versionNo}`}
        ref={field}
        readOnly
        value={link.url}
        onFocus={(e) => e.currentTarget.select()}
        className="block min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" onClick={() => void onCopy()}>
          Copy link
        </Button>
        <span role="status" className="text-sm">
          {copy === 'copied' && 'Link copied.'}
          {copy === 'manual' &&
            "Couldn't copy automatically. The link is selected: press Ctrl+C (or Cmd+C) to copy it."}
        </span>
      </div>
      <p className="text-sm">Expires {formatDate(link.expiresAt)}.</p>
      <p className="text-sm font-medium">
        This link is shown only once. If you lose it, issue a new link: the old one will stop
        working.
      </p>
    </div>
  );
}

/** Link status and actions for a pending version. */
export function VersionLinkSection({
  versionId,
  versionNo,
  links,
  projectActive,
  online,
  initial,
  onChanged,
}: {
  versionId: string;
  versionNo: number;
  links: ApprovalLink[];
  projectActive: boolean;
  online: boolean;
  initial: { link: IssuedLink | null; failed: boolean };
  onChanged: (message: string) => Promise<void>;
}) {
  const [issued, setIssued] = useState<IssuedLink | null>(initial.link);
  const [failed, setFailed] = useState(initial.failed);
  const [confirm, setConfirm] = useState<'issue' | 'revoke' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const status = linkStatus(links.filter((l) => l.version_id === versionId));

  async function issue() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      setIssued(await issueLink(versionId));
      setFailed(false);
      setConfirm(null);
      await onChanged(`New link created for version ${versionNo}.`);
    } catch (e) {
      setError(errorMessages[toApiError(e).code]);
      setConfirm(null);
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const done = await revokeApprovalLink(versionId);
      setIssued(null);
      setConfirm(null);
      await onChanged(
        done ? `Link for version ${versionNo} revoked.` : 'That link was not active.',
      );
    } catch (e) {
      setError(errorMessages[toApiError(e).code]);
      setConfirm(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm">
        <span className="font-medium">Client link: </span>
        {linkStatusLabel(status)}
      </p>
      {failed && !issued && (
        <Alert tone="error">
          Version {versionNo} was sent but no link was created. Create a link to share it with your
          client.
        </Alert>
      )}
      {error && <Alert tone="error">{error}</Alert>}
      {issued && <IssuedLinkBox link={issued} versionNo={versionNo} />}

      {confirm === 'issue' && (
        <div
          role="group"
          aria-labelledby={`issue-c-${versionId}`}
          className="space-y-2 rounded-md border border-slate-300 p-3"
        >
          <p id={`issue-c-${versionId}`} className="text-sm font-semibold">
            {status.kind === 'active'
              ? 'Issue a new link? The previous link will stop working.'
              : 'Create a link for this version?'}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button busy={busy} disabled={!online} onClick={() => void issue()}>
              Yes, issue a new link
            </Button>
            <Button variant="ghost" onClick={() => setConfirm(null)}>
              Keep the current link
            </Button>
          </div>
        </div>
      )}
      {confirm === 'revoke' && (
        <div
          role="group"
          aria-labelledby={`revoke-c-${versionId}`}
          className="space-y-2 rounded-md border border-slate-300 p-3"
        >
          <p id={`revoke-c-${versionId}`} className="text-sm font-semibold">
            Revoke the link? Your client will no longer be able to open it.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              busy={busy}
              disabled={!online}
              onClick={() => void revoke()}
            >
              Yes, revoke it
            </Button>
            <Button variant="ghost" onClick={() => setConfirm(null)}>
              Keep it
            </Button>
          </div>
        </div>
      )}

      {confirm === null && (
        <div className="flex flex-wrap gap-2">
          {projectActive &&
            (failed && !issued ? (
              <Button busy={busy} disabled={!online} onClick={() => void issue()}>
                Create a link
              </Button>
            ) : (
              <Button
                variant="secondary"
                disabled={!online || busy}
                onClick={() => setConfirm('issue')}
              >
                {status.kind === 'none' ? 'Create a link' : 'Issue a new link'}
              </Button>
            ))}
          {status.kind === 'active' && (
            <Button variant="ghost" disabled={!online || busy} onClick={() => setConfirm('revoke')}>
              Revoke link
            </Button>
          )}
        </div>
      )}
      {!projectActive && (
        <p className="text-sm text-slate-600">
          New links can only be issued while the project is active. You can still revoke a link.
        </p>
      )}
    </div>
  );
}

/** The client's recorded answer, shown against the exact version it answers. */
export function ClientDecisionBlock({ decision }: { decision: ClientDecisionRow }) {
  return (
    <div className="mt-4 space-y-1 rounded-md border border-slate-300 bg-slate-50 p-3 text-sm">
      <p className="font-semibold">
        {ownerDecisionText(decision.decision)} on {formatDateTime(decision.decided_at)}
      </p>
      {decision.decision === 'clarification_requested' && (
        <p>Not an approval: reply to your client and send a new version.</p>
      )}
      {decision.comment ? (
        <blockquote className="whitespace-pre-wrap border-l-2 border-slate-400 pl-3 wrap-anywhere">
          {decision.comment}
        </blockquote>
      ) : (
        <p className="text-slate-600">No comment.</p>
      )}
    </div>
  );
}
