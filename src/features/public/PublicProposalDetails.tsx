import type { PublicProposal } from '../../lib/api/publicProposal';
import { formatPriceImpact, formatTimeImpact } from '../../lib/domain/changeOrder';
import { formatDate } from '../../lib/domain/format';

/** Read-only proposal as the client sees it: only the fields of the public projection (BR-1). */
export function PublicProposalDetails({ proposal: p }: { proposal: PublicProposal }) {
  return (
    <article
      aria-labelledby="proposal-heading"
      className="space-y-5 rounded-lg border border-slate-200 bg-white p-4 sm:p-6"
    >
      <header className="space-y-1 text-sm text-slate-700">
        <p className="font-semibold text-slate-900 wrap-anywhere">{p.project_title}</p>
        <p className="wrap-anywhere">Prepared for {p.client_name}</p>
        <p className="wrap-anywhere">From {p.freelancer_name ?? 'Your freelancer'}</p>
        <p>
          Version {p.version_no} · sent {formatDate(p.sent_at)} · link valid until{' '}
          {formatDate(p.expires_at)}
        </p>
      </header>
      <h2 id="proposal-heading" className="text-xl font-semibold text-slate-900 wrap-anywhere">
        {p.title}
      </h2>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-slate-600">Proposed price impact</dt>
          <dd className="font-medium wrap-anywhere">
            {formatPriceImpact(p.price_impact, p.currency)}
          </dd>
        </div>
        <div>
          <dt className="text-slate-600">Proposed time impact</dt>
          <dd className="font-medium">
            {formatTimeImpact(p.time_impact_value, p.time_impact_unit)}
          </dd>
        </div>
        <div>
          <dt className="text-slate-600">Proposed deadline</dt>
          <dd className="font-medium">
            {p.proposed_deadline ? formatDate(p.proposed_deadline) : 'No change'}
          </dd>
        </div>
      </dl>
      <div>
        <h3 className="text-sm font-semibold text-slate-800">What&apos;s included</h3>
        <p className="mt-1 whitespace-pre-wrap text-sm wrap-anywhere">
          {p.description || 'No description.'}
        </p>
      </div>
      {(
        [
          ['assumptions', 'Assumptions'],
          ['exclusions', 'Not included in this change'],
          ['client_terms', 'Terms'],
        ] as const
      ).map(([key, label]) =>
        p[key] ? (
          <div key={key}>
            <h3 className="text-sm font-semibold text-slate-800">{label}</h3>
            <p className="mt-1 whitespace-pre-wrap text-sm wrap-anywhere">{p[key]}</p>
          </div>
        ) : null,
      )}
    </article>
  );
}
