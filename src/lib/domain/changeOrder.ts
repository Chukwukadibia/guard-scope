/** Phase 4 change-proposal rules (FEATURE_SPEC change-orders). Mirrors the database checks. */
import { formatMoney, numericToInput } from './format';
import { supportedCurrencies } from './profile';
import { todayLocal } from './request';

export type ProposalStatus =
  | 'draft'
  | 'pending'
  | 'approved'
  | 'declined'
  | 'clarification_requested'
  | 'cancelled'
  | 'superseded';
export type TimeUnit = 'hours' | 'days' | 'weeks';

export const CO_LIMITS = { title: 200, text: 5000 };

export const proposalStatusLabel: Record<ProposalStatus, string> = {
  draft: 'Draft (not sent)',
  pending: 'Sent, waiting for the client',
  approved: 'Approved by client',
  declined: 'Declined by client',
  clarification_requested: 'Client asked for clarification',
  cancelled: 'Cancelled',
  superseded: 'Replaced by a newer version',
};

export const timeUnitLabel: Record<TimeUnit, { one: string; many: string }> = {
  hours: { one: 'hour', many: 'hours' },
  days: { one: 'day', many: 'days' },
  weeks: { one: 'week', many: 'weeks' },
};

export type ProposalFormValues = {
  title: string;
  description: string;
  price_impact: string;
  currency: string;
  time_impact_value: string;
  time_impact_unit: '' | TimeUnit;
  proposed_deadline: string;
  assumptions: string;
  exclusions: string;
  client_terms: string;
};
export type ProposalFieldErrors = Partial<Record<keyof ProposalFormValues, string>>;

const MONEY_RE = /^\d{1,12}(\.\d{1,2})?$/;
const TIME_RE = /^\d{1,6}(\.\d{1,2})?$/;

/** Validation for saving a draft (format and limits only). */
export function validateProposalDraft(v: ProposalFormValues): ProposalFieldErrors {
  const e: ProposalFieldErrors = {};
  if (!v.title.trim()) e.title = 'Enter a title your client will recognise.';
  else if (v.title.length > CO_LIMITS.title)
    e.title = `Use ${CO_LIMITS.title} characters or fewer.`;
  for (const k of ['description', 'assumptions', 'exclusions', 'client_terms'] as const) {
    if (v[k].length > CO_LIMITS.text) e[k] = `Use ${CO_LIMITS.text} characters or fewer.`;
  }
  if (v.price_impact.trim() && !MONEY_RE.test(v.price_impact.trim())) {
    e.price_impact = 'Enter an amount like 400 or 400.50 (no negative values).';
  }
  const list = supportedCurrencies();
  if (!/^[A-Z]{3}$/.test(v.currency) || (list.length > 0 && !list.includes(v.currency))) {
    e.currency = 'Choose a currency from the list.';
  }
  const hasValue = v.time_impact_value.trim() !== '';
  if (hasValue && !TIME_RE.test(v.time_impact_value.trim())) {
    e.time_impact_value = 'Enter a number like 3 or 1.5.';
  } else if (hasValue !== (v.time_impact_unit !== '')) {
    e[hasValue ? 'time_impact_unit' : 'time_impact_value'] =
      'Enter both the amount of time and the unit, or leave both empty.';
  }
  if (v.proposed_deadline && !/^\d{4}-\d{2}-\d{2}$/.test(v.proposed_deadline))
    e.proposed_deadline = 'Enter a valid date.';
  return e;
}

/** Extra rules that apply when sending (BR-7). */
export function validateProposalForSend(
  v: ProposalFormValues,
  today = todayLocal(),
): ProposalFieldErrors {
  const e = validateProposalDraft(v);
  if (!e.description && !v.description.trim())
    e.description = 'Describe the extra work before sending.';
  const price = Number(v.price_impact.trim() || '0');
  const time = Number(v.time_impact_value.trim() || '0');
  if (!e.price_impact && !e.time_impact_value && !(price > 0 || time > 0)) {
    e.price_impact = 'Enter a price impact above 0, a time impact above 0, or both.';
  }
  if (!e.proposed_deadline && v.proposed_deadline && v.proposed_deadline < today) {
    e.proposed_deadline = "The proposed deadline can't be in the past.";
  }
  return e;
}

export function toProposalInput(v: ProposalFormValues) {
  const opt = (s: string) => (s.trim() === '' ? null : s.trim());
  return {
    title: v.title.trim(),
    description: v.description.trim(),
    price_impact: v.price_impact.trim() === '' ? '0' : v.price_impact.trim(),
    currency: v.currency,
    time_impact_value: opt(v.time_impact_value),
    time_impact_unit: v.time_impact_unit === '' ? null : v.time_impact_unit,
    proposed_deadline: v.proposed_deadline || null,
    assumptions: opt(v.assumptions),
    exclusions: opt(v.exclusions),
    client_terms: opt(v.client_terms),
  };
}

/** "EUR 400.00" or "No change"; always with currency (PRD §7.5). Never "paid"/"earned" (§7.4). */
export function formatPriceImpact(amount: string | number | null, currency: string): string {
  const n = Number(amount ?? 0);
  return n > 0 ? `+${formatMoney(n, currency)}` : 'No price change';
}

export function formatTimeImpact(value: string | number | null, unit: TimeUnit | null): string {
  if (value === null || value === '' || unit === null) return 'No time change';
  const n = Number(value);
  if (!(n > 0)) return 'No time change';
  const label = n === 1 ? timeUnitLabel[unit].one : timeUnitLabel[unit].many;
  return `+${n} ${label}`;
}

/** Version row (as returned by the API: numerics may be numbers) -> form strings (ISS-017). */
export function proposalToFormValues(v: {
  title: string;
  description: string | null;
  price_impact: string | number;
  currency: string;
  time_impact_value: string | number | null;
  time_impact_unit: TimeUnit | null;
  proposed_deadline: string | null;
  assumptions: string | null;
  exclusions: string | null;
  client_terms: string | null;
}): ProposalFormValues {
  return {
    title: v.title,
    description: v.description ?? '',
    price_impact: Number(v.price_impact) > 0 ? numericToInput(v.price_impact) : '',
    currency: v.currency,
    time_impact_value: numericToInput(v.time_impact_value),
    time_impact_unit: v.time_impact_unit ?? '',
    proposed_deadline: v.proposed_deadline ?? '',
    assumptions: v.assumptions ?? '',
    exclusions: v.exclusions ?? '',
    client_terms: v.client_terms ?? '',
  };
}

/**
 * The version the proposal page header describes (title, badge, document title).
 * Active project: the newest version, which may be the editable draft.
 * Completed/archived project: the draft editor is hidden, so the header uses the newest
 * sent version; only a never-sent proposal falls back to its draft (badge "Draft (not sent)").
 */
export function headerVersion<V extends { status: ProposalStatus }>(
  co: { versions: V[] },
  projectActive: boolean,
): V | undefined {
  const newest = co.versions.at(-1);
  if (projectActive) return newest;
  return co.versions.filter((v) => v.status !== 'draft').at(-1) ?? newest;
}

/** Header version count. On a closed project only sent versions are shown, so only they are counted. */
export function versionCountLabel(
  versions: { status: ProposalStatus }[],
  projectActive: boolean,
): string {
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
  if (projectActive) return plural(versions.length, 'version');
  const sent = versions.filter((v) => v.status !== 'draft').length;
  return sent > 0 ? plural(sent, 'sent version') : 'Draft only, not sent';
}
