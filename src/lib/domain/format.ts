/** Display helpers. Money always shows an explicit currency (PRD §7.5, BR-5); never summed across currencies. */
export function formatMoney(
  amount: string | number | null | undefined,
  currency: string | null | undefined,
): string {
  if (amount === null || amount === undefined || amount === '') return 'Not specified';
  const value = typeof amount === 'number' ? amount : Number(amount);
  if (!currency) return String(amount);
  try {
    const formatted = new Intl.NumberFormat('en', {
      style: 'currency',
      currency,
      currencyDisplay: 'code',
    }).format(value);
    return formatted.replace(/\u00a0/g, ' ');
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

/** Date-only values (YYYY-MM-DD) are formatted in UTC so they never shift a day across time zones. */
export function formatDate(date: string | null | undefined): string {
  if (!date) return 'Not set';
  const d = new Date(`${date.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return date;
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeZone: 'UTC' }).format(d);
}

/** Server timestamps (e.g. confirmation time), shown in the viewer's local time with the zone name. */
export function formatDateTime(ts: string | null | undefined): string {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  // dateStyle/timeStyle cannot be combined with timeZoneName (TypeError), so use explicit components.
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(d);
}

export function revisionAllowanceLabel(type: string, count: number | null): string {
  if (type === 'none') return 'No revisions included';
  if (type === 'number')
    return count === 1 ? '1 revision included' : `${count ?? 0} revisions included`;
  return 'Not specified';
}

export const statusLabel: Record<string, string> = {
  active: 'Active',
  completed: 'Completed',
  archived: 'Archived',
};

export const kindHeading: Record<'deliverable' | 'exclusion' | 'assumption', string> = {
  deliverable: 'Deliverables',
  exclusion: 'Not included (exclusions)',
  assumption: 'Assumptions',
};
