import { useCallback, useEffect, useRef, useState } from 'react';
import { WifiOff } from 'lucide-react';
import { Brand } from '../../components/layout/Brand';
import { Alert } from '../../components/ui/Alert';
import { Button, Spinner } from '../../components/ui/Button';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useOnline } from '../../hooks/useOnline';
import {
  getPublicProposal,
  submitPublicDecision,
  type PublicProposal,
  type PublicProposalResult,
  type RecordedDecision,
} from '../../lib/api/publicProposal';
import { toApiError } from '../../lib/api/errors';
import { formatDateTime } from '../../lib/domain/format';
import {
  attemptFor,
  clientResponseText,
  decisionLabel,
  tokenFromHash,
  unavailableCopy,
  type Attempt,
  type ClientDecision,
  type UnavailableState,
} from '../../lib/domain/publicLink';
import { PublicDecisionForm } from './PublicDecisionForm';
import { PublicProposalDetails } from './PublicProposalDetails';

/**
 * The token lives in memory only. It is captured from the URL fragment and the fragment is removed
 * from the address bar before any network request (AC-4). The module variable survives React's
 * StrictMode double mount; it is never written to storage, the title, a URL or the console.
 * A later hash-only navigation (another link pasted into the same tab) fires `hashchange`: the outer
 * component captures the new fragment and remounts the inner page (new key), which drops all previous
 * state (decision, comment, confirm step) and ignores answers to requests made for the old token.
 */
let capturedToken: string | null = null;
function captureToken(): string | null {
  if (window.location.hash) {
    capturedToken = tokenFromHash(window.location.hash);
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }
  return capturedToken;
}

type View =
  | { kind: 'loading' }
  | { kind: 'network' }
  | { kind: 'result'; data: PublicProposalResult }
  | { kind: 'done'; proposal: PublicProposal | null; decision: RecordedDecision };

function Shell({ children }: { children: React.ReactNode }) {
  const online = useOnline();
  return (
    <div className="min-h-screen bg-slate-50">
      {!online && (
        <div
          role="status"
          className="flex items-center justify-center gap-2 bg-amber-100 px-4 py-2 text-sm text-amber-950"
        >
          <WifiOff aria-hidden="true" className="h-4 w-4" />
          You&apos;re offline. Reconnect to continue.
        </div>
      )}
      <main id="main" className="mx-auto w-full max-w-2xl px-4 py-8">
        <div className="mb-6">
          <Brand />
        </div>
        {children}
      </main>
    </div>
  );
}

export function PublicProposalPage() {
  const [link, setLink] = useState(() => ({ token: captureToken(), gen: 0 }));
  useEffect(() => {
    function onHashChange() {
      if (!window.location.hash) return; // our own cleanup or navigation to a bare /p: keep the view
      const next = captureToken();
      setLink((l) => ({ token: next, gen: l.gen + 1 }));
    }
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);
  return <PublicProposalView key={link.gen} token={link.token} />;
}

function PublicProposalView({ token }: { token: string | null }) {
  const online = useOnline();
  // Bumped on unmount and on every new load; an answer for an older request is ignored.
  const requestId = useRef(0);
  const [view, setView] = useState<View>(
    token ? { kind: 'loading' } : { kind: 'result', data: { state: 'invalid' } },
  );
  const attempt = useRef<Attempt | null>(null);

  useDocumentTitle('Proposal');
  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex';
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);

  const load = useCallback(async () => {
    if (!token) return;
    const id = ++requestId.current;
    setView({ kind: 'loading' });
    try {
      const data = await getPublicProposal(token);
      if (id === requestId.current) setView({ kind: 'result', data });
    } catch (e) {
      if (id !== requestId.current) return;
      const code = toApiError(e).code;
      setView(
        code === 'rate_limited'
          ? { kind: 'result', data: { state: 'rate_limited' } }
          : { kind: 'network' },
      );
    }
  }, [token]);

  useEffect(() => {
    void load();
    return () => {
      requestId.current++;
    };
  }, [load]);

  /** Returns a field-level message for the comment, or null when the page moved on. */
  async function submit(
    proposal: PublicProposal,
    decision: ClientDecision,
    comment: string,
  ): Promise<{ error: string } | null> {
    if (!token) return null;
    attempt.current = attemptFor(attempt.current, decision, comment, () => crypto.randomUUID());
    const id = requestId.current;
    try {
      const r = await submitPublicDecision(token, decision, comment, attempt.current.key);
      if (id !== requestId.current) return null; // the page moved to another link meanwhile
      attempt.current = null; // definitive server answer: the next attempt gets a new key
      if ('result' in r) {
        setView({
          kind: 'done',
          proposal,
          decision: { decision: r.decision, decided_at: r.decided_at },
        });
        return null;
      }
      if (r.error === 'validation')
        return { error: 'Your response could not be recorded. Check the comment and try again.' };
      if (r.error === 'decided') {
        await load(); // someone answered meanwhile: show the recorded response
        return null;
      }
      setView({ kind: 'result', data: { state: r.error } });
      return null;
    } catch (e) {
      if (id !== requestId.current) return null;
      // Transport/server failure: keep the same idempotency key so a retry cannot duplicate.
      return {
        error:
          toApiError(e).code === 'rate_limited'
            ? 'Too many attempts, try again later.'
            : "We couldn't reach the server. Your response was not confirmed; check your connection and try again.",
      };
    }
  }

  if (view.kind === 'loading') {
    return (
      <Shell>
        <Spinner label="Loading proposal…" />
      </Shell>
    );
  }
  if (view.kind === 'network') {
    return (
      <Shell>
        <h1 className="text-xl font-semibold text-slate-900">
          We couldn&apos;t load this proposal
        </h1>
        <p className="mt-2 text-sm text-slate-700">
          Check your connection and try again. Your link is still valid.
        </p>
        <div className="mt-4">
          <Button onClick={() => void load()} disabled={!online}>
            Try again
          </Button>
        </div>
      </Shell>
    );
  }
  if (view.kind === 'done') {
    return (
      <Shell>
        <Confirmation proposal={view.proposal} decision={view.decision} />
      </Shell>
    );
  }

  const data = view.data;
  if (data.state === 'valid') {
    return (
      <Shell>
        <PublicProposalDetails proposal={data.proposal} />
        <PublicDecisionForm
          versionNo={data.proposal.version_no}
          onSubmit={(d, c) => submit(data.proposal, d, c)}
        />
      </Shell>
    );
  }
  if (data.state === 'decided') {
    return (
      <Shell>
        <section
          aria-labelledby="recorded-heading"
          className="mb-6 rounded-lg border-2 border-slate-400 bg-white p-4"
        >
          <h1 id="recorded-heading" className="text-lg font-semibold text-slate-900">
            A response was already recorded
          </h1>
          <RecordedResponse decision={data.decision} />
        </section>
        <PublicProposalDetails proposal={data.proposal} />
      </Shell>
    );
  }
  const copy = unavailableCopy(
    data.state as UnavailableState,
    'freelancer_name' in data ? (data.freelancer_name ?? null) : null,
  );
  return (
    <Shell>
      <div className="text-center">
        <h1 className="text-xl font-semibold text-slate-900 wrap-anywhere">{copy.title}</h1>
        <p className="mt-2 text-sm text-slate-700 wrap-anywhere">{copy.body}</p>
      </div>
    </Shell>
  );
}

function RecordedResponse({ decision }: { decision: RecordedDecision }) {
  return (
    <div className="mt-2 space-y-1 text-sm text-slate-800">
      <p className="font-medium">
        {decisionLabel[decision.decision]} · {formatDateTime(decision.decided_at)}
      </p>
      <p>{clientResponseText(decision.decision)}</p>
    </div>
  );
}

function Confirmation({
  proposal,
  decision,
}: {
  proposal: PublicProposal | null;
  decision: RecordedDecision;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  return (
    <section aria-labelledby="done-heading" className="space-y-4">
      <Alert tone="success">Your response has been recorded.</Alert>
      <h1
        id="done-heading"
        ref={heading}
        tabIndex={-1}
        className="text-xl font-semibold text-slate-900 focus:outline-none"
      >
        Your response has been recorded
      </h1>
      <RecordedResponse decision={decision} />
      {proposal && (
        <p className="text-sm text-slate-700 wrap-anywhere">
          Recorded for version {proposal.version_no} of &ldquo;{proposal.title}&rdquo; (
          {proposal.project_title}).
        </p>
      )}
      <p className="text-sm text-slate-700">You can close this page. Nothing else is needed.</p>
    </section>
  );
}
