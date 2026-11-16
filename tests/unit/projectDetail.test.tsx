import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { ApiError, toApiError } from '../../src/lib/api/errors';
import type { Project } from '../../src/lib/api/projects';
import type { ProjectScope, ScopeVersion } from '../../src/lib/api/scope';

// Regression tests for P2 D-1 (not-found page), D-3 (overview revision allowance) and
// D-4 (one-shot "Project created." notice). The API layer is mocked; the page is real.
const api = vi.hoisted(() => ({ getProject: vi.fn(), getProjectScope: vi.fn() }));
vi.mock('../../src/lib/api/projects', () => ({
  getProject: api.getProject,
  updateProject: vi.fn(),
}));
vi.mock('../../src/lib/api/scope', () => ({ getProjectScope: api.getProjectScope }));

import { ProjectDetailPage } from '../../src/features/projects/ProjectDetailPage';

const id = '3f1e0c5a-9a7b-4c1d-8e2f-0123456789ab';
const project: Project = {
  id,
  title: 'Website',
  client_name: 'Acme',
  client_contact: null,
  description: null,
  agreed_price: null,
  currency: 'EUR',
  start_date: null,
  deadline: null,
  status: 'active',
  created_at: '2026-11-16T10:00:00Z',
  updated_at: '2026-11-16T10:00:00Z',
  archived_at: null,
};
const baseline: ScopeVersion = {
  id: 'v1',
  project_id: id,
  version_no: 1,
  summary: null,
  revision_allowance_type: 'number',
  revision_allowance_count: 2,
  notes: null,
  agreed_price: null,
  currency: 'EUR',
  deadline: null,
  confirmed_at: '2026-11-16T12:00:00Z',
  is_original_baseline: true,
  created_at: '2026-11-16T10:00:00Z',
  updated_at: '2026-11-16T12:00:00Z',
  scope_items: [
    { id: 'i1', scope_version_id: 'v1', kind: 'deliverable', description: 'D', sort_order: 0 },
    { id: 'i2', scope_version_id: 'v1', kind: 'exclusion', description: 'E', sort_order: 0 },
  ],
};
const scope: ProjectScope = { baseline, current: baseline, draft: null, versions: [baseline] };

let seenState: unknown = 'unset';
function StateProbe() {
  seenState = useLocation().state;
  return null;
}

function renderAt(entry: { pathname: string; state?: unknown }) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route
          path="/projects/:id"
          element={
            <>
              <ProjectDetailPage />
              <StateProbe />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(cleanup);

beforeEach(() => {
  api.getProject.mockReset();
  api.getProjectScope.mockReset();
  seenState = 'unset';
});

describe('ProjectDetailPage', () => {
  test.each([
    ['missing or not yours (PGRST116)', toApiError({ code: 'PGRST116' })],
    ['RPC not_found', toApiError({ code: 'P0001', message: 'not_found' })],
    ['malformed id', new ApiError('not_found')],
  ])('%s shows "Project not found"', async (_label, err) => {
    api.getProject.mockRejectedValue(err);
    api.getProjectScope.mockResolvedValue(scope);
    renderAt({ pathname: `/projects/${id}` });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Project not found' }),
    ).toBeInTheDocument();
  });

  test('overview shows the original scope revision allowance (PROJ-003)', async () => {
    api.getProject.mockResolvedValue(project);
    api.getProjectScope.mockResolvedValue(scope);
    renderAt({ pathname: `/projects/${id}` });
    const dd = await screen.findByText(/1 deliverable, 1 exclusion/);
    expect(dd).toHaveTextContent('Revisions: 2 revisions included');
  });

  test('the saved notice is shown once and the history state is cleared', async () => {
    api.getProject.mockResolvedValue(project);
    api.getProjectScope.mockResolvedValue(scope);
    renderAt({ pathname: `/projects/${id}`, state: { saved: 'created' } });
    expect(await screen.findByText('Project created.')).toBeInTheDocument();
    await waitFor(() => expect(seenState).toBeNull());
    // still visible after the state was cleared (the notice lives in component state)
    expect(screen.getByText('Project created.')).toBeInTheDocument();
  });
});
