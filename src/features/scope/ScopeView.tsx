import type { ScopeItemKind, ScopeVersion } from '../../lib/api/scope';
import {
  formatDate,
  formatMoney,
  kindHeading,
  revisionAllowanceLabel,
} from '../../lib/domain/format';

export function ItemList({ version, kind }: { version: ScopeVersion; kind: ScopeItemKind }) {
  const items = version.scope_items.filter((i) => i.kind === kind);
  return (
    <div>
      <h4 className="text-sm font-semibold text-slate-800">{kindHeading[kind]}</h4>
      {items.length === 0 ? (
        <p className="mt-1 text-sm text-slate-600">None recorded.</p>
      ) : (
        <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
          {items.map((i) => (
            <li key={i.id} className="wrap-anywhere">
              {i.description}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Read-only rendering of a confirmed scope version, including its snapshotted commercial terms. */
export function ScopeView({ version }: { version: ScopeVersion }) {
  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-slate-600">Agreed price</dt>
          <dd className="font-medium">{formatMoney(version.agreed_price, version.currency)}</dd>
        </div>
        <div>
          <dt className="text-slate-600">Deadline</dt>
          <dd className="font-medium">{formatDate(version.deadline)}</dd>
        </div>
        <div>
          <dt className="text-slate-600">Revisions</dt>
          <dd className="font-medium">
            {revisionAllowanceLabel(
              version.revision_allowance_type,
              version.revision_allowance_count,
            )}
          </dd>
        </div>
      </dl>
      {version.summary && (
        <div>
          <h4 className="text-sm font-semibold text-slate-800">Summary</h4>
          <p className="mt-1 whitespace-pre-wrap wrap-anywhere text-sm">{version.summary}</p>
        </div>
      )}
      <ItemList version={version} kind="deliverable" />
      <ItemList version={version} kind="exclusion" />
      <ItemList version={version} kind="assumption" />
      {version.notes && (
        <div>
          <h4 className="text-sm font-semibold text-slate-800">Notes</h4>
          <p className="mt-1 whitespace-pre-wrap wrap-anywhere text-sm">{version.notes}</p>
        </div>
      )}
    </div>
  );
}
