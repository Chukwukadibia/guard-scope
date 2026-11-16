import { describe, expect, test } from 'vitest';
import {
  classificationExplainer,
  emptyRequest,
  summariseRevisions,
  todayLocal,
  toRequestInput,
  validateRequest,
} from '../../src/lib/domain/request';

const today = '2026-11-16';
const base = { ...emptyRequest(), title: 'Add a blog', received_on: today };

describe('validateRequest (REQ-001, AC-2)', () => {
  test('title only is valid; today default', () => {
    expect(validateRequest(base, today)).toEqual({});
    expect(emptyRequest().received_on).toBe(todayLocal());
  });
  test('missing or too-long title', () => {
    expect(validateRequest({ ...base, title: '  ' }, today).title).toBeDefined();
    expect(validateRequest({ ...base, title: 'a'.repeat(201) }, today).title).toBeDefined();
    expect(validateRequest({ ...base, title: 'a'.repeat(200) }, today).title).toBeUndefined();
  });
  test('future date rejected; today and past accepted (BR-5)', () => {
    expect(
      validateRequest({ ...base, received_on: '2026-11-17' }, today).received_on,
    ).toBeDefined();
    expect(
      validateRequest({ ...base, received_on: '2026-11-16' }, today).received_on,
    ).toBeUndefined();
    expect(
      validateRequest({ ...base, received_on: '2025-01-01' }, today).received_on,
    ).toBeUndefined();
    expect(validateRequest({ ...base, received_on: '' }, today).received_on).toBeDefined();
  });
  test('invalid channel and long notes', () => {
    const invalid = { ...base, source_channel: 'telegram' } as unknown as Parameters<
      typeof validateRequest
    >[0];
    expect(validateRequest(invalid, today).source_channel).toBeDefined();
    expect(
      validateRequest({ ...base, internal_notes: 'a'.repeat(5001) }, today).internal_notes,
    ).toBeDefined();
    expect(
      validateRequest({ ...base, description: 'a'.repeat(5001) }, today).description,
    ).toBeDefined();
  });
  test('toRequestInput trims and nulls optionals', () => {
    expect(
      toRequestInput({ ...base, title: ' T ', description: ' ', source_channel: '' }),
    ).toMatchObject({
      title: 'T',
      description: null,
      source_channel: null,
      internal_notes: null,
    });
  });
});

describe('summariseRevisions (PRD §7.2, AC-6)', () => {
  test('numeric allowance: remaining never negative, over-use reported', () => {
    expect(summariseRevisions('number', 2, 1)).toMatchObject({ remaining: 1, overBy: 0 });
    expect(summariseRevisions('number', 2, 2)).toMatchObject({ remaining: 0, overBy: 0 });
    expect(summariseRevisions('number', 2, 3)).toMatchObject({ remaining: 0, overBy: 1 });
  });
  test('none / not specified: no remaining figure is inferred', () => {
    expect(summariseRevisions('not_specified', null, 4).remaining).toBeNull();
    expect(summariseRevisions('none', null, 1).remaining).toBeNull();
    expect(summariseRevisions(null, null, 0).remaining).toBeNull();
  });
});

test('classification wording is not a legal conclusion (BR-6)', () => {
  for (const text of Object.values(classificationExplainer)) {
    expect(text).toMatch(/^You /);
    expect(text).not.toMatch(/legal|binding|breach|entitled/i);
  }
});

test('Additional explainer does not claim change proposals are unavailable (ISS-018)', () => {
  for (const text of Object.values(classificationExplainer)) {
    expect(text).not.toMatch(
      /once .* available|not (yet )?available|coming soon|next release|later release/i,
    );
  }
  expect(classificationExplainer.additional).toMatch(/change proposal/);
});
