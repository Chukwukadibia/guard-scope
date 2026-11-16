import { describe, expect, test } from 'vitest';
import {
  toProjectInput,
  validateItemText,
  validateProject,
  type ProjectFormValues,
} from '../../src/lib/domain/project';
import {
  formatDate,
  formatDateTime,
  formatMoney,
  revisionAllowanceLabel,
} from '../../src/lib/domain/format';

const base: ProjectFormValues = {
  title: 'Landing page',
  client_name: 'Acme',
  client_contact: '',
  description: '',
  agreed_price: '',
  currency: 'EUR',
  start_date: '',
  deadline: '',
};

describe('validateProject (PROJ-002, AC-2)', () => {
  test('required fields only is valid', () => expect(validateProject(base)).toEqual({}));
  test('missing title, client, currency', () => {
    const e = validateProject({ ...base, title: ' ', client_name: '', currency: '' });
    expect(Object.keys(e).sort()).toEqual(['client_name', 'currency', 'title']);
  });
  test('length limits', () => {
    expect(validateProject({ ...base, title: 'a'.repeat(201) }).title).toBeDefined();
    expect(validateProject({ ...base, title: 'a'.repeat(200) }).title).toBeUndefined();
    expect(
      validateProject({ ...base, client_contact: 'a'.repeat(321) }).client_contact,
    ).toBeDefined();
    expect(validateProject({ ...base, description: 'a'.repeat(5001) }).description).toBeDefined();
  });
  test.each(['-1', '1.234', 'abc', '1e3', '1,000'])('rejects price %s', (p) =>
    expect(validateProject({ ...base, agreed_price: p }).agreed_price).toBeDefined(),
  );
  test.each(['0', '1500', '1500.5', '1500.50'])('accepts price %s', (p) =>
    expect(validateProject({ ...base, agreed_price: p }).agreed_price).toBeUndefined(),
  );
  test('deadline before start date', () => {
    expect(
      validateProject({ ...base, start_date: '2026-12-01', deadline: '2026-11-30' }).deadline,
    ).toBeDefined();
    expect(
      validateProject({ ...base, start_date: '2026-12-01', deadline: '2026-12-01' }).deadline,
    ).toBeUndefined();
  });
  test('invalid currency code', () =>
    expect(validateProject({ ...base, currency: 'XXZ' }).currency).toBeDefined());
  test('toProjectInput trims and nulls optionals', () => {
    expect(
      toProjectInput({ ...base, title: ' T ', client_contact: '  ', agreed_price: '' }),
    ).toMatchObject({
      title: 'T',
      client_contact: null,
      agreed_price: null,
      start_date: null,
    });
  });
  test('item text', () => {
    expect(validateItemText('  ')).toBeDefined();
    expect(validateItemText('a'.repeat(1001))).toBeDefined();
    expect(validateItemText('Home page')).toBeUndefined();
  });
});

describe('format (BR-4, BR-5)', () => {
  test('money always carries the currency code; empty is "Not specified"', () => {
    expect(formatMoney('2000', 'EUR')).toMatch(/EUR/);
    expect(formatMoney('2000.5', 'NGN')).toMatch(/NGN/);
    expect(formatMoney(null, 'EUR')).toBe('Not specified');
  });
  test('date-only values do not shift across time zones', () => {
    expect(formatDate('2026-12-31')).toBe('31 Dec 2026');
    expect(formatDate(null)).toBe('Not set');
  });
  test('server timestamps format with date, time and zone (regression: Intl option clash crashed the page)', () => {
    const out = formatDateTime('2026-11-16T12:34:00Z');
    expect(out).toMatch(/2026/);
    expect(out).toMatch(/\d{2}:\d{2}/);
    expect(formatDateTime(null)).toBe('');
  });
  test('revision allowance labels never assume 0 or unlimited', () => {
    expect(revisionAllowanceLabel('not_specified', null)).toBe('Not specified');
    expect(revisionAllowanceLabel('none', null)).toBe('No revisions included');
    expect(revisionAllowanceLabel('number', 1)).toBe('1 revision included');
    expect(revisionAllowanceLabel('number', 3)).toBe('3 revisions included');
  });
});
