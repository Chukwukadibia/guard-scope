import { beforeEach, expect, test, vi } from 'vitest';

// P2 D-1 regression: a malformed project id from the URL is "not found" without a request
// (PostgREST would answer 22P02, which would otherwise surface as "Something went wrong").
const from = vi.hoisted(() => vi.fn());
vi.mock('../../src/lib/supabase', () => ({ supabase: { from } }));

import { getProject, updateProject } from '../../src/lib/api/projects';
import { getProjectScope } from '../../src/lib/api/scope';

beforeEach(() => from.mockReset());

test.each(['not-a-uuid', '', '3f1e0c5a-9a7b-4c1d-8e2f-0123456789ab; drop'])(
  'malformed id %j -> not_found, no request',
  async (id) => {
    await expect(getProject(id)).rejects.toMatchObject({ code: 'not_found' });
    await expect(getProjectScope(id)).rejects.toMatchObject({ code: 'not_found' });
    await expect(updateProject(id, { status: 'archived' })).rejects.toMatchObject({
      code: 'not_found',
    });
    expect(from).not.toHaveBeenCalled();
  },
);

test('a valid id with no row (RLS-hidden or missing) -> not_found', async () => {
  const chain = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
  };
  from.mockReturnValue(chain);
  await expect(getProject('3f1e0c5a-9a7b-4c1d-8e2f-0123456789ab')).rejects.toMatchObject({
    code: 'not_found',
  });
});
