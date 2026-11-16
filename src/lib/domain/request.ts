/** Phase 3 request rules (FEATURE_SPEC request-capture). Mirrors the database checks. */
export type Classification = 'unclassified' | 'included' | 'additional' | 'needs_clarification';
export type SourceChannel = 'whatsapp' | 'email' | 'call' | 'meeting' | 'other';

export const REQUEST_LIMITS = {
  title: 200,
  description: 5000,
  internal_notes: 5000,
  revision_note: 500,
};

export const classificationLabel: Record<Classification, string> = {
  unclassified: 'Not classified yet',
  included: 'Included',
  additional: 'Additional',
  needs_clarification: 'Needs clarification',
};

/** Plain-language description; never a legal conclusion (BR-6). */
export const classificationExplainer: Record<Exclude<Classification, 'unclassified'>, string> = {
  included: 'You marked this as covered by the agreement or the remaining revisions.',
  additional:
    'You marked this as outside the agreement. It can become a change proposal once change orders are available.',
  needs_clarification: 'You need more information before deciding.',
};

export const channelLabel: Record<SourceChannel, string> = {
  whatsapp: 'WhatsApp',
  email: 'Email',
  call: 'Call',
  meeting: 'Meeting',
  other: 'Other',
};

export type RequestFormValues = {
  title: string;
  description: string;
  source_channel: '' | SourceChannel;
  received_on: string;
  internal_notes: string;
};

export type RequestFieldErrors = Partial<Record<keyof RequestFormValues, string>>;

/** Local calendar date as YYYY-MM-DD. */
export function todayLocal(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export const emptyRequest = (): RequestFormValues => ({
  title: '',
  description: '',
  source_channel: '',
  received_on: todayLocal(),
  internal_notes: '',
});

export function validateRequest(v: RequestFormValues, today = todayLocal()): RequestFieldErrors {
  const e: RequestFieldErrors = {};
  if (!v.title.trim()) e.title = 'Enter a short title for the request.';
  else if (v.title.length > REQUEST_LIMITS.title)
    e.title = `Use ${REQUEST_LIMITS.title} characters or fewer.`;
  if (v.description.length > REQUEST_LIMITS.description)
    e.description = `Use ${REQUEST_LIMITS.description} characters or fewer.`;
  if (v.internal_notes.length > REQUEST_LIMITS.internal_notes) {
    e.internal_notes = `Use ${REQUEST_LIMITS.internal_notes} characters or fewer.`;
  }
  if (v.source_channel && !(v.source_channel in channelLabel))
    e.source_channel = 'Choose a channel from the list.';
  if (!v.received_on) e.received_on = 'Enter the date you received the request.';
  else if (!/^\d{4}-\d{2}-\d{2}$/.test(v.received_on)) e.received_on = 'Enter a valid date.';
  else if (v.received_on > today) e.received_on = "The received date can't be in the future.";
  return e;
}

export function toRequestInput(v: RequestFormValues) {
  const opt = (s: string) => (s.trim() === '' ? null : s.trim());
  return {
    title: v.title.trim(),
    description: opt(v.description),
    source_channel: v.source_channel === '' ? null : v.source_channel,
    received_on: v.received_on,
    internal_notes: opt(v.internal_notes),
  };
}

export type RevisionSummary = {
  allowanceType: 'none' | 'number' | 'not_specified' | null; // null = no confirmed scope
  allowanceCount: number | null;
  used: number;
  /** Only for numeric allowances; never negative (PRD §7.2: no inference). */
  remaining: number | null;
  overBy: number;
};

export function summariseRevisions(
  allowanceType: RevisionSummary['allowanceType'],
  allowanceCount: number | null,
  used: number,
): RevisionSummary {
  if (allowanceType === 'number' && allowanceCount !== null) {
    return {
      allowanceType,
      allowanceCount,
      used,
      remaining: Math.max(allowanceCount - used, 0),
      overBy: Math.max(used - allowanceCount, 0),
    };
  }
  return { allowanceType, allowanceCount, used, remaining: null, overBy: 0 };
}
