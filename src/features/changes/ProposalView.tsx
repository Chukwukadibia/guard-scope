import type { ProposalVersion } from '../../lib/api/changeOrders';
import { formatPriceImpact, formatTimeImpact } from '../../lib/domain/changeOrder';
import { formatDate } from '../../lib/domain/format';

/** Read-only rendering of one proposal version, as the client will see it (client-facing fields only). */
export function ProposalView({
  version,
  headingLevel = 3,
}: {
  version: ProposalVersion;
  headingLevel?: 3 | 4;
}) {
  const H = headingLevel === 3 ? 'h3' : 'h4';
  const Sub = headingLevel === 3 ? 'h4' : 'h5';
  return (
    <div className="space-y-4">
      <H className="text-base font-semibold wrap-anywhere">{version.title}</H>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-slate-600">Proposed price impact</dt>
          <dd className="font-medium">
            {formatPriceImpact(version.price_impact, version.currency)}
          </dd>
        </div>
        <div>
          <dt className="text-slate-600">Proposed time impact</dt>
          <dd className="font-medium">
            {formatTimeImpact(version.time_impact_value, version.time_impact_unit)}
          </dd>
        </div>
        <div>
          <dt className="text-slate-600">Proposed deadline</dt>
          <dd className="font-medium">
            {version.proposed_deadline ? formatDate(version.proposed_deadline) : 'No change'}
          </dd>
        </div>
      </dl>
      <div>
        <Sub className="text-sm font-semibold text-slate-800">What&apos;s included</Sub>
        <p className="mt-1 whitespace-pre-wrap text-sm wrap-anywhere">
          {version.description || 'No description yet.'}
        </p>
      </div>
      {(
        [
          ['assumptions', 'Assumptions'],
          ['exclusions', 'Not included in this change'],
          ['client_terms', 'Terms'],
        ] as const
      ).map(([key, label]) =>
        version[key] ? (
          <div key={key}>
            <Sub className="text-sm font-semibold text-slate-800">{label}</Sub>
            <p className="mt-1 whitespace-pre-wrap text-sm wrap-anywhere">{version[key]}</p>
          </div>
        ) : null,
      )}
    </div>
  );
}
