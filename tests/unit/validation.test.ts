import { describe, expect, test } from 'vitest';
import { validateEmail, validateNewPassword } from '../../src/lib/domain/validation';
import { validateProfileInput } from '../../src/lib/domain/profile';

describe('auth validation', () => {
  test('email', () => {
    expect(validateEmail('')).toBeDefined();
    expect(validateEmail('not-an-email')).toBeDefined();
    expect(validateEmail('a@guardscope.test')).toBeUndefined();
  });
  test('password minimum 8 (BR-1)', () => {
    expect(validateNewPassword('1234567')).toBeDefined();
    expect(validateNewPassword('12345678')).toBeUndefined();
  });
});

describe('profile validation (AC-8, T-12)', () => {
  test('display name length', () => {
    expect(validateProfileInput({ display_name: 'a'.repeat(120) })).toEqual({});
    expect(validateProfileInput({ display_name: 'a'.repeat(121) }).display_name).toBeDefined();
    expect(validateProfileInput({ display_name: '   ' }).display_name).toBeDefined();
    expect(validateProfileInput({ display_name: null })).toEqual({});
  });
  test('currency must be a supported ISO code; empty allowed (no USD default)', () => {
    expect(validateProfileInput({ default_currency: 'EUR' })).toEqual({});
    expect(validateProfileInput({ default_currency: null })).toEqual({});
    expect(validateProfileInput({ default_currency: 'XXZ' }).default_currency).toBeDefined();
    expect(validateProfileInput({ default_currency: 'eur' }).default_currency).toBeDefined();
  });
});
