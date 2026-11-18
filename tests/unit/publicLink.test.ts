import { describe, expect, it } from 'vitest';
import {
  attemptFor,
  buildApprovalUrl,
  clientResponseText,
  confirmationText,
  isValidToken,
  linkStatus,
  linkStatusLabel,
  ownerDecisionText,
  tokenFromHash,
  unavailableCopy,
  type ClientDecision,
  type UnavailableState,
} from '../../src/lib/domain/publicLink';

const TOKEN = 'A'.repeat(20) + 'b-_'.repeat(5) + '01234567';
const states: UnavailableState[] = [
  'invalid',
  'expired',
  'revoked',
  'superseded',
  'cancelled',
  'rate_limited',
];
const decisions: ClientDecision[] = ['approved', 'declined', 'clarification_requested'];
const forbidden = /signed|legally binding|certified|e-signature|\bpaid\b|collected|earned/i;

describe('token parsing', () => {
  it('test token is 43 chars', () => expect(TOKEN).toHaveLength(43));
  it('accepts a 43 char base64url fragment', () => {
    expect(tokenFromHash(`#${TOKEN}`)).toBe(TOKEN);
    expect(isValidToken(TOKEN)).toBe(true);
  });
  it.each([
    '',
    '#',
    TOKEN, // no leading #
    `#${TOKEN.slice(1)}`, // 42
    `#${TOKEN}A`, // 44
    `#${TOKEN}#x`,
    `#t=${TOKEN}`,
    `#${TOKEN.slice(0, 42)}=`,
    `#${TOKEN.slice(0, 42)}+`,
    `#${TOKEN.slice(0, 42)}/`,
    `#${TOKEN.slice(0, 42)} `,
    `# ${TOKEN.slice(1)}`,
    `#${TOKEN.slice(0, 42)}%`,
    `#${TOKEN.slice(0, 42)}\n`,
  ])('rejects malformed hash %j', (h) => expect(tokenFromHash(h)).toBeNull());
  it('rejects non-strings', () => expect(isValidToken(undefined)).toBe(false));
});

describe('buildApprovalUrl', () => {
  it('puts the token in the fragment only', () => {
    const u = buildApprovalUrl('https://app.example.com', TOKEN);
    expect(u).toBe(`https://app.example.com/p#${TOKEN}`);
    expect(u).not.toContain('?');
  });
  it('tolerates trailing slashes', () => {
    expect(buildApprovalUrl('http://localhost:4173//', TOKEN)).toBe(
      `http://localhost:4173/p#${TOKEN}`,
    );
  });
});

describe('public copy', () => {
  it('has copy for every state, with a title and body', () => {
    for (const s of states) {
      const c = unavailableCopy(s, 'Alex');
      expect(c.title.length).toBeGreaterThan(3);
      expect(c.body.length).toBeGreaterThan(3);
    }
  });
  it('never uses forbidden wording', () => {
    for (const s of states)
      for (const n of ['Alex', null]) {
        const c = unavailableCopy(s, n);
        expect(`${c.title} ${c.body}`).not.toMatch(forbidden);
      }
    for (const d of decisions) {
      expect(clientResponseText(d)).not.toMatch(forbidden);
      expect(confirmationText(d, 2)).not.toMatch(forbidden);
      expect(ownerDecisionText(d)).not.toMatch(forbidden);
    }
  });
  it('names the freelancer for expired/revoked/superseded/cancelled', () => {
    for (const s of ['expired', 'revoked', 'superseded', 'cancelled'] as const)
      expect(unavailableCopy(s, 'Alex').body).toContain('Alex');
  });
  it('uses the required wording', () => {
    expect(unavailableCopy('invalid', null).body).toContain('Open the link you were sent again');
    expect(unavailableCopy('superseded', null).body).toContain(
      'A newer version was sent, please use the new link',
    );
    expect(unavailableCopy('rate_limited', null).body).toContain('try again later');
  });
  it('never presents a clarification as an approval', () => {
    expect(clientResponseText('clarification_requested')).toContain('This version is now closed');
    expect(clientResponseText('clarification_requested')).toContain('will send you a new version');
    for (const d of decisions)
      expect(clientResponseText(d)).not.toMatch(/legally binding|signed|contract|e-signature/i);
    expect(clientResponseText('clarification_requested')).not.toMatch(/approv/i);
    expect(confirmationText('approved', 3)).toContain('not a payment');
  });
});

describe('idempotency attempts', () => {
  let n = 0;
  const gen = () => `key-${++n}`;
  it('reuses the key for an identical retry', () => {
    const a = attemptFor(null, 'approved', 'ok', gen);
    expect(attemptFor(a, 'approved', 'ok', gen)).toBe(a);
  });
  it('uses a new key when the decision or comment changes, or after a definitive answer', () => {
    const a = attemptFor(null, 'approved', 'ok', gen);
    expect(attemptFor(a, 'declined', 'ok', gen).key).not.toBe(a.key);
    expect(attemptFor(a, 'approved', 'other', gen).key).not.toBe(a.key);
    expect(attemptFor(null, 'approved', 'ok', gen).key).not.toBe(a.key);
  });
});

describe('linkStatus', () => {
  const now = new Date('2026-11-17T12:00:00Z');
  const future = '2026-12-01T00:00:00Z';
  const past = '2026-11-01T00:00:00Z';
  it('none', () => expect(linkStatus([], now)).toEqual({ kind: 'none' }));
  it('active', () => {
    const s = linkStatus([{ expires_at: future, revoked_at: null, created_at: past }], now);
    expect(s).toEqual({ kind: 'active', expiresAt: future });
    expect(linkStatusLabel(s)).toMatch(/^Active until /);
  });
  it('expired', () =>
    expect(linkStatus([{ expires_at: past, revoked_at: null, created_at: past }], now)).toEqual({
      kind: 'expired',
    }));
  it('revoked', () =>
    expect(linkStatus([{ expires_at: future, revoked_at: past, created_at: past }], now)).toEqual({
      kind: 'revoked',
    }));
  it('uses the newest link', () => {
    const s = linkStatus(
      [
        { expires_at: future, revoked_at: past, created_at: '2026-11-02T00:00:00Z' },
        { expires_at: future, revoked_at: null, created_at: '2026-11-10T00:00:00Z' },
      ],
      now,
    );
    expect(s.kind).toBe('active');
  });
  it('labels', () => {
    expect(linkStatusLabel({ kind: 'expired' })).toBe('Expired');
    expect(linkStatusLabel({ kind: 'revoked' })).toBe('Revoked');
    expect(linkStatusLabel({ kind: 'none' })).toBe('No active link');
  });
});
