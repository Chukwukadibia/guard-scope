import { test, expect, isMobile } from './helpers';
import {
  openProject,
  archiveTracked,
  trackCreatedProjects,
  type TrackedProjects,
} from './p2-helpers';
import {
  apiConfirmedProject,
  apiCreateRequest,
  logEvidence,
  openRequest,
  requestsRegion,
  tokenOf,
  uniq3,
} from './p3-helpers';

/** Phase 3 Tester, retest 1 — O-a (list query carries no private notes) and the app's history read order. */
test.use({ signedInAs: 'A' });

let tracked: TrackedProjects = [];
test.beforeEach(({ page }) => {
  tracked = trackCreatedProjects(page);
});
test.afterEach(async ({ page }) => {
  await archiveTracked(page, tracked);
});

test('O-a: project and request pages never fetch internal_notes in list queries; history read by seq', async ({
  page,
  sessionA,
}, testInfo) => {
  test.skip(isMobile(testInfo), 'network shape is the same at both widths');
  const token = tokenOf(sessionA);
  const pid = await apiConfirmedProject(page, token, uniq3(testInfo, 'notes-min'));
  const rid = await apiCreateRequest(page, token, pid, {
    title: 'Notes minimisation',
    internal_notes: 'TOP-SECRET-NOTE-XYZ',
  });

  const seen: { url: string; body: string }[] = [];
  page.on('response', async (r) => {
    const u = r.url();
    if (u.includes('/rest/v1/requests') || u.includes('/rest/v1/activity_events')) {
      let body = '';
      try {
        body = await r.text();
      } catch {
        /* navigation may discard the body */
      }
      seen.push({ url: decodeURIComponent(u), body });
    }
  });

  await openProject(page, pid);
  await expect(
    requestsRegion(page).getByRole('link', { name: /Notes minimisation/ }),
  ).toBeVisible();
  await openRequest(page, pid, rid);
  await expect(page.getByText('TOP-SECRET-NOTE-XYZ')).toBeVisible(); // detail view still loads notes
  await page.waitForLoadState('networkidle');

  const isDetail = (u: string) => new RegExp(`[?&]id=eq\\.${rid}`).test(u);
  const lists = seen.filter(
    (s) =>
      s.url.includes('/rest/v1/requests') && s.url.includes('project_id=eq.') && !isDetail(s.url),
  );
  const details = seen.filter((s) => s.url.includes('/rest/v1/requests') && isDetail(s.url));
  const history = seen.filter((s) => s.url.includes('/rest/v1/activity_events'));
  logEvidence('e2e-retest1-Oa.jsonl', testInfo, 'requests/events queries', {
    lists: lists.map((s) => ({
      url: s.url.replace(/^.*\/rest/, '/rest'),
      notesInBody: s.body.includes('TOP-SECRET'),
    })),
    details: details.map((s) => s.url.replace(/^.*\/rest/, '/rest')),
    history: history.map((s) => s.url.replace(/^.*\/rest/, '/rest')),
  });
  expect(lists.length, 'list queries observed').toBeGreaterThan(0);
  for (const l of lists) {
    expect(l.url).not.toContain('internal_notes');
    expect(l.body).not.toContain('TOP-SECRET-NOTE-XYZ');
  }
  expect(details.length, 'detail query observed').toBeGreaterThan(0);
  expect(history.length, 'history query observed').toBeGreaterThan(0);
  for (const h of history) expect(h.url).toMatch(/order=seq\.asc/);
});
