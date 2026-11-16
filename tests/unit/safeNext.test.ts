import { describe, expect, test } from 'vitest';
import { safeNext } from '../../src/lib/domain/safeNext';

describe('safeNext (T-05, AC-3)', () => {
  test.each([
    ['/projects', '/projects'],
    ['/settings?tab=1', '/settings?tab=1'],
    [null, '/'],
    ['', '/'],
  ])('allows in-app path %s', (input, expected) => {
    expect(safeNext(input)).toBe(expected);
  });

  test.each([
    '//evil.com',
    'https://evil.com',
    '/\\evil.com',
    'javascript:alert(1)',
    'evil.com',
    '/\t/evil.com',
  ])('rejects %s', (input) => {
    expect(safeNext(input)).toBe('/');
  });
});
