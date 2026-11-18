/** Pure helpers for the client approval link (Phase 5). No I/O, so every rule here is unit-testable. */
import { formatDate } from './format';

export type ClientDecision = 'approved' | 'declined' | 'clarification_requested';

/** 256-bit token, base64url without padding (FEATURE_SPEC AC-2). */
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

export const isValidToken = (value: unknown): value is string =>
  typeof value === 'string' && TOKEN_RE.test(value);

/**
 * Reads the token from a location hash such as "#<43 chars>". Anything else (no hash, wrong length,
 * extra characters, a second fragment, key=value pairs) is null: the page then shows "isn't available".
 */
export function tokenFromHash(hash: string): string | null {
  if (!hash.startsWith('#')) return null;
  const candidate = hash.slice(1);
  return isValidToken(candidate) ? candidate : null;
}

/** The link the freelancer shares. The token is only ever in the fragment, never in a query string. */
export function buildApprovalUrl(baseUrl: string, token: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/p#${token}`;
}

export const decisionLabel: Record<ClientDecision, string> = {
  approved: 'Approved',
  declined: 'Declined',
  clarification_requested: 'Asked a question',
};

/** What the client reads about their own recorded response. Never "signed"/"binding"/payment wording. */
export function clientResponseText(decision: ClientDecision): string {
  switch (decision) {
    case 'approved':
      return 'You approved this proposal.';
    case 'declined':
      return 'You declined this proposal.';
    case 'clarification_requested':
      return 'You asked a question. This version is now closed. The sender has been told and will send you a new version if needed.';
  }
}

export function confirmationText(decision: ClientDecision, versionNo: number): string {
  switch (decision) {
    case 'approved':
      return `You are about to approve version ${versionNo} of this proposal. Approving is not a payment.`;
    case 'declined':
      return `You are about to decline version ${versionNo} of this proposal.`;
    case 'clarification_requested':
      return `You are about to ask a question about version ${versionNo}. This is not an approval: the sender will reply separately.`;
  }
}

export type UnavailableState =
  'invalid' | 'expired' | 'revoked' | 'superseded' | 'cancelled' | 'rate_limited';

export const unavailableStates: UnavailableState[] = [
  'invalid',
  'expired',
  'revoked',
  'superseded',
  'cancelled',
  'rate_limited',
];

/** Safe explanation per link state. The freelancer's name is shown only where the server provided it. */
export function unavailableCopy(
  state: UnavailableState,
  freelancerName: string | null,
): { title: string; body: string } {
  const contact = freelancerName
    ? `Please contact ${freelancerName}.`
    : 'Please contact the person who sent it.';
  switch (state) {
    case 'invalid':
      return {
        title: "This link isn't available",
        body: 'Open the link you were sent again. If it still does not work, ask the sender for a new link.',
      };
    case 'expired':
      return { title: 'This link has expired', body: `${contact} They can send you a new link.` };
    case 'revoked':
      return {
        title: 'This link was withdrawn',
        body: `${contact} They can send you a new link.`,
      };
    case 'superseded':
      return {
        title: 'A newer version was sent',
        body: `A newer version was sent, please use the new link. ${contact}`,
      };
    case 'cancelled':
      return {
        title: 'This proposal was cancelled',
        body: `The sender cancelled this proposal, so no response is needed. ${contact}`,
      };
    case 'rate_limited':
      return {
        title: 'Too many attempts',
        body: 'Too many attempts, try again later.',
      };
  }
}

/**
 * Idempotency (BR-3): one key per decision attempt. A retry after a network error (same decision and
 * comment) reuses the key so it can never create a duplicate; anything else starts a new attempt.
 */
export type Attempt = { key: string; decision: ClientDecision; comment: string };

export function attemptFor(
  previous: Attempt | null,
  decision: ClientDecision,
  comment: string,
  newKey: () => string,
): Attempt {
  if (previous && previous.decision === decision && previous.comment === comment) return previous;
  return { key: newKey(), decision, comment };
}

export const COMMENT_MAX = 2000;

/** Owner-side link status for a pending version (links are listed for that version). */
export type LinkInfo = { expires_at: string; revoked_at: string | null; created_at: string };

export type LinkStatus =
  | { kind: 'active'; expiresAt: string }
  | { kind: 'expired' }
  | { kind: 'revoked' }
  | { kind: 'none' };

export function linkStatus(links: LinkInfo[], now: Date = new Date()): LinkStatus {
  const latest = [...links].sort((a, b) => a.created_at.localeCompare(b.created_at)).at(-1);
  if (!latest) return { kind: 'none' };
  if (latest.revoked_at) return { kind: 'revoked' };
  if (new Date(latest.expires_at).getTime() <= now.getTime()) return { kind: 'expired' };
  return { kind: 'active', expiresAt: latest.expires_at };
}

export function linkStatusLabel(s: LinkStatus): string {
  switch (s.kind) {
    case 'active':
      return `Active until ${formatDate(s.expiresAt)}`;
    case 'expired':
      return 'Expired';
    case 'revoked':
      return 'Revoked';
    case 'none':
      return 'No active link';
  }
}

/** How the owner sees the client's answer; clarification is never an approval (BR-5). */
export function ownerDecisionText(decision: ClientDecision): string {
  switch (decision) {
    case 'approved':
      return 'Client approved';
    case 'declined':
      return 'Client declined';
    case 'clarification_requested':
      return 'Client asked for clarification';
  }
}
