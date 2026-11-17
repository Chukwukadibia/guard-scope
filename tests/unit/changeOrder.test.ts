import { describe, expect, test } from 'vitest';
import {
  formatPriceImpact,
  formatTimeImpact,
  headerStatus,
  headerVersion,
  proposalStatusLabel,
  toProposalInput,
  validateProposalDraft,
  validateProposalForSend,
  versionCountLabel,
  type ProposalFormValues,
  type ProposalStatus,
} from '../../src/lib/domain/changeOrder';

const base: ProposalFormValues = {
  title: 'Pricing page',
  description: 'Build a pricing page',
  price_impact: '400',
  currency: 'GBP',
  time_impact_value: '',
  time_impact_unit: '',
  proposed_deadline: '',
  assumptions: '',
  exclusions: '',
  client_terms: '',
};
const today = '2026-11-16';

describe('validateProposalDraft (AC-2)', () => {
  test('valid draft', () => expect(validateProposalDraft(base)).toEqual({}));
  test('title required and limited', () => {
    expect(validateProposalDraft({ ...base, title: ' ' }).title).toBeDefined();
    expect(validateProposalDraft({ ...base, title: 'a'.repeat(201) }).title).toBeDefined();
  });
  test.each(['-1', '1.234', 'abc'])('rejects price %s', (p) =>
    expect(validateProposalDraft({ ...base, price_impact: p }).price_impact).toBeDefined(),
  );
  test('time value and unit must come together', () => {
    expect(
      validateProposalDraft({ ...base, time_impact_value: '3' }).time_impact_unit,
    ).toBeDefined();
    expect(
      validateProposalDraft({ ...base, time_impact_unit: 'days' }).time_impact_value,
    ).toBeDefined();
    expect(
      validateProposalDraft({ ...base, time_impact_value: '3', time_impact_unit: 'days' }),
    ).toEqual({});
  });
  test('draft may have an empty description (required only at send)', () =>
    expect(validateProposalDraft({ ...base, description: '' })).toEqual({}));
});

describe('validateProposalForSend (AC-3, BR-7)', () => {
  test('description required', () =>
    expect(validateProposalForSend({ ...base, description: '' }, today).description).toBeDefined());
  test('needs price > 0 or time > 0; time-only is allowed (CO-003)', () => {
    expect(
      validateProposalForSend({ ...base, price_impact: '' }, today).price_impact,
    ).toBeDefined();
    expect(
      validateProposalForSend({ ...base, price_impact: '0' }, today).price_impact,
    ).toBeDefined();
    expect(
      validateProposalForSend(
        { ...base, price_impact: '', time_impact_value: '2', time_impact_unit: 'days' },
        today,
      ),
    ).toEqual({});
  });
  test('deadline not in the past', () => {
    expect(
      validateProposalForSend({ ...base, proposed_deadline: '2026-11-15' }, today)
        .proposed_deadline,
    ).toBeDefined();
    expect(validateProposalForSend({ ...base, proposed_deadline: '2026-11-16' }, today)).toEqual(
      {},
    );
  });
});

test('toProposalInput normalises empties', () => {
  expect(toProposalInput({ ...base, price_impact: '', assumptions: ' ' })).toMatchObject({
    price_impact: '0',
    assumptions: null,
    time_impact_value: null,
    time_impact_unit: null,
    proposed_deadline: null,
  });
});

describe('formatting (AC-10, PRD §7.4/§7.5)', () => {
  test('price always has currency; zero is "No price change"', () => {
    expect(formatPriceImpact('400', 'GBP')).toMatch(/^\+GBP/);
    expect(formatPriceImpact('0', 'GBP')).toBe('No price change');
  });
  test('time impact', () => {
    expect(formatTimeImpact('3', 'days')).toBe('+3 days');
    expect(formatTimeImpact('1', 'weeks')).toBe('+1 week');
    expect(formatTimeImpact(null, null)).toBe('No time change');
  });
  test('no status label claims money was paid, collected or earned', () => {
    for (const label of Object.values(proposalStatusLabel))
      expect(label).not.toMatch(/paid|collected|earned/i);
  });
});

describe('ISS-017: API numerics arrive as JSON numbers', () => {
  test('proposalToFormValues converts numbers to strings so validation/trim never crash', async () => {
    const { proposalToFormValues } = await import('../../src/lib/domain/changeOrder');
    const v = proposalToFormValues({
      title: 'T',
      description: 'D',
      price_impact: 400,
      currency: 'GBP',
      time_impact_value: 3,
      time_impact_unit: 'days',
      proposed_deadline: null,
      assumptions: null,
      exclusions: null,
      client_terms: null,
    });
    expect(v.price_impact).toBe('400');
    expect(v.time_impact_value).toBe('3');
    expect(() => validateProposalForSend(v, today)).not.toThrow();
    expect(() => toProposalInput(v)).not.toThrow();
  });
});

describe('proposal page header on closed projects (ISS-019)', () => {
  const v = (version_no: number, status: ProposalStatus) => ({
    version_no,
    status,
    title: `Title ${version_no}`,
  });
  const sentThenDraft = { versions: [v(1, 'pending'), v(2, 'draft')] };
  const draftOnly = { versions: [v(1, 'draft')] };

  test('active project: header shows the newest version, including the draft', () => {
    expect(headerVersion(sentThenDraft, true)?.version_no).toBe(2);
    expect(versionCountLabel(sentThenDraft.versions, true)).toBe('2 versions');
  });

  test('closed project: header never describes the hidden draft when a sent version exists', () => {
    const h = headerVersion(sentThenDraft, false);
    expect(h?.version_no).toBe(1);
    expect(h?.status).not.toBe('draft');
    expect(versionCountLabel(sentThenDraft.versions, false)).toBe('1 sent version');
    const many = [v(1, 'cancelled'), v(2, 'pending'), v(3, 'draft')];
    expect(headerVersion({ versions: many }, false)?.version_no).toBe(2);
    expect(versionCountLabel(many, false)).toBe('2 sent versions');
  });

  test('closed project with a never-sent draft: shows the draft, labelled as not sent', () => {
    expect(headerVersion(draftOnly, false)?.status).toBe('draft');
    expect(versionCountLabel(draftOnly.versions, false)).toBe('Draft only, not sent');
  });

  test('no versions: undefined', () => {
    expect(headerVersion({ versions: [] }, false)).toBeUndefined();
  });
});

describe('project list item and request panel agree with the proposal page (ISS-021)', () => {
  const sv = (version_no: number, status: ProposalStatus) => ({
    version_no,
    status,
    title: `t${version_no}`,
  });
  const sentPlusDraft = [sv(1, 'superseded'), sv(2, 'pending'), sv(3, 'draft')];

  test('list item: active project shows the draft, closed project the latest sent version', () => {
    expect(headerVersion({ versions: sentPlusDraft }, true)?.title).toBe('t3');
    const closed = headerVersion({ versions: sentPlusDraft }, false);
    expect(closed?.title).toBe('t2');
    expect(closed?.version_no).toBe(2);
    expect(closed?.status).toBe('pending');
  });

  test('list item: draft-only proposal still shows its draft on a closed project', () => {
    expect(headerVersion({ versions: [sv(1, 'draft')] }, false)?.status).toBe('draft');
  });

  test('request panel status: draft on active, sent status on closed', () => {
    expect(headerStatus(sentPlusDraft, true)).toBe('draft');
    expect(headerStatus(sentPlusDraft, false)).toBe('pending');
    expect(headerStatus([sv(1, 'approved')], false)).toBe('approved');
  });

  test('request panel status: draft only, or no versions, reads as draft', () => {
    expect(headerStatus([sv(1, 'draft')], false)).toBe('draft');
    expect(headerStatus([sv(1, 'draft')], true)).toBe('draft');
    expect(headerStatus([], false)).toBe('draft');
  });
});
