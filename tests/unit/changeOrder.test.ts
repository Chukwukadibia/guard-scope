import { describe, expect, test } from 'vitest';
import {
  formatPriceImpact,
  formatTimeImpact,
  proposalStatusLabel,
  toProposalInput,
  validateProposalDraft,
  validateProposalForSend,
  type ProposalFormValues,
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
