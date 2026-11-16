import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const from = vi.hoisted(() => vi.fn());
vi.mock('../../src/lib/supabase', () => ({ supabase: { from } }));

import { RequestHistoryList } from '../../src/features/requests/RequestHistory';
import { listEntityEvents, type ActivityEvent } from '../../src/lib/api/activity';
import { getRequest, listRequests } from '../../src/lib/api/requests';
import { classificationTransition } from '../../src/lib/domain/request';

const ev = (over: Partial<ActivityEvent>): ActivityEvent => ({
  id: crypto.randomUUID(),
  seq: 1,
  event_type: 'request.created',
  entity_type: 'request',
  entity_id: 'r1',
  summary: 'Request recorded: Logo',
  metadata: {},
  actor_type: 'freelancer',
  created_at: '2026-11-16T10:00:00Z',
  ...over,
});

/** Records every builder call so the query shape can be asserted. */
function recordingChain(result: unknown) {
  const calls: [string, unknown[]][] = [];
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'order', 'limit']) {
    chain[m] = (...args: unknown[]) => {
      calls.push([m, args]);
      return m === 'limit' ? Promise.resolve(result) : chain;
    };
  }
  chain.maybeSingle = (...args: unknown[]) => {
    calls.push(['maybeSingle', args]);
    return Promise.resolve(result);
  };
  return { chain, calls };
}

beforeEach(() => from.mockReset());

describe('classificationTransition (ISS-014, AC-3)', () => {
  test('labels from and to of a classification event', () => {
    expect(
      classificationTransition('request.classified', { from: 'unclassified', to: 'additional' }),
    ).toEqual({ from: 'Not classified yet', to: 'Additional' });
    expect(
      classificationTransition('request.classified', {
        from: 'included',
        to: 'needs_clarification',
      }),
    ).toEqual({ from: 'Included', to: 'Needs clarification' });
  });

  test.each([
    ['request.created', { from: 'included', to: 'additional' }],
    ['request.classified', {}],
    ['request.classified', null],
    ['request.classified', { from: 'included', to: 'legally_out' }],
    ['request.classified', { from: '__proto__', to: 'included' }],
    ['request.classified', { from: 1, to: 'included' }],
  ])('%s with %j -> null', (type, metadata) => {
    expect(classificationTransition(type, metadata)).toBeNull();
  });
});

describe('RequestHistoryList', () => {
  test('shows summary, from -> to and time for classification entries', () => {
    render(
      <RequestHistoryList
        events={[
          ev({ seq: 1 }),
          ev({
            seq: 2,
            event_type: 'request.classified',
            summary: 'Marked "Logo" as Additional',
            metadata: { from: 'unclassified', to: 'additional' },
          }),
        ]}
      />,
    );
    const items = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('Request recorded: Logo');
    expect(items[0]).not.toHaveTextContent('→');
    expect(items[1]).toHaveTextContent('Marked "Logo" as Additional');
    // visible "from → to"; screen readers get "Changed from … to …"
    expect(items[1]).toHaveTextContent(/Changed from Not classified yet\s*→\s*to Additional/);
    expect(items[1]).toHaveTextContent(/2026/);
  });
});

describe('API readers', () => {
  test('history is ordered by seq, not created_at (ISS-015)', async () => {
    const { chain, calls } = recordingChain({ data: [], error: null });
    from.mockReturnValue(chain);
    await listEntityEvents('request', 'r1');
    expect(from).toHaveBeenCalledWith('activity_events');
    const orders = calls.filter(([m]) => m === 'order').map(([, a]) => a);
    expect(orders).toEqual([['seq', { ascending: true }]]);
    expect(String(calls.find(([m]) => m === 'select')?.[1][0])).toMatch(/\bseq\b/);
  });

  test('the request list does not select private notes; the detail does (O-3)', async () => {
    const id = '3f1e0c5a-9a7b-4c1d-8e2f-0123456789ab';
    const list = recordingChain({ data: [], error: null });
    from.mockReturnValue(list.chain);
    await listRequests(id);
    expect(String(list.calls.find(([m]) => m === 'select')?.[1][0])).not.toMatch(/internal_notes/);

    const detail = recordingChain({ data: { id }, error: null });
    from.mockReturnValue(detail.chain);
    await getRequest(id, id);
    expect(String(detail.calls.find(([m]) => m === 'select')?.[1][0])).toMatch(/internal_notes/);
  });
});
