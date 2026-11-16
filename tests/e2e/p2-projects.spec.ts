import { test, expect, USER_B, apiSession, isMobile, signInViaUi } from './helpers';
import {
  apiCreateProject,
  archiveTracked,
  openProject,
  rest,
  shot,
  trackCreatedProjects,
  type TrackedProjects,
  uniq,
} from './p2-helpers';

/**
 * Phase 2 Tester — projects (T-01, T-02, T-03, T-09, §6 not-found). Written from FEATURE_SPEC/TEST_PLAN.
 * Data is tagged "P2T …"; leftover rows are removed by the Tester's SQL cleanup after the run.
 */
test.use({ signedInAs: 'A' });

// Test hygiene: archive every project this test created (see trackCreatedProjects).
let tracked: TrackedProjects = [];
test.beforeEach(({ page }) => {
  tracked = trackCreatedProjects(page);
});
test.afterEach(async ({ page }) => {
  await archiveTracked(page, tracked);
});

const tokenOf = (s: Record<string, unknown>) => s.access_token as string;
const userIdOf = (s: Record<string, unknown>) => (s.user as { id: string }).id;

test.describe('T-01 / AC-1 create and persist', () => {
  test('required fields only: saves, defaults shown as "Not specified"/"Not set", persists on reload', async ({
    page,
  }, testInfo) => {
    const title = uniq(testInfo, 'req');
    await page.goto('/projects/new');
    await expect(page.getByLabel('Currency')).toHaveValue(''); // no default set -> nothing pre-selected
    await page.getByLabel('Project title').fill(title);
    await page.getByLabel('Client name').fill('Required Client');
    await page.getByLabel('Currency').selectOption('GBP');
    await page.getByRole('button', { name: 'Create project' }).click();
    await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/);
    await expect(page.getByText('Project created.')).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
    await expect(page.getByText('Client: Required Client')).toBeVisible();
    const overview = page.getByRole('region', { name: 'Overview' });
    await expect(overview.getByText('Not specified')).toBeVisible(); // BR-5 price optional
    await expect(overview.getByText('GBP')).toBeVisible();
    await expect(page.getByText('Active', { exact: true }).first()).toBeVisible();
    await shot(page, testInfo, 'T01-required-only');
  });

  test('all fields: values save and reload exactly in detail and edit form', async ({
    page,
  }, testInfo) => {
    const title = uniq(testInfo, 'all');
    await page.goto('/projects/new');
    await page.getByLabel('Project title').fill(title);
    await page.getByLabel('Client name').fill('Full Client Ltd');
    await page.getByLabel('Client contact').fill('client@example.test');
    await page.getByLabel('Description').fill('Line one\nLine two');
    await page.getByLabel('Agreed price').fill('1500.50');
    await page.getByLabel('Currency').selectOption('EUR');
    await page.getByLabel('Start date').fill('2026-11-01');
    await page.getByLabel('Deadline').fill('2026-12-31');
    await page.getByRole('button', { name: 'Create project' }).click();
    await expect(page.getByText('Project created.')).toBeVisible();
    await page.reload();
    const overview = page.getByRole('region', { name: 'Overview' });
    await expect(overview.getByText('EUR 1,500.50')).toBeVisible();
    await expect(overview.getByText('1 Nov 2026')).toBeVisible();
    await expect(overview.getByText('31 Dec 2026')).toBeVisible();
    await expect(overview.getByText('client@example.test')).toBeVisible();
    await expect(overview.getByText(/Line one\s+Line two/)).toBeVisible();
    await page.getByRole('link', { name: 'Edit project' }).click();
    await expect(page.getByLabel('Project title')).toHaveValue(title);
    await expect(page.getByLabel('Client name')).toHaveValue('Full Client Ltd');
    await expect(page.getByLabel('Client contact')).toHaveValue('client@example.test');
    await expect(page.getByLabel('Description')).toHaveValue('Line one\nLine two');
    await expect(page.getByLabel('Agreed price')).toHaveValue(/^1500\.50?$/);
    await expect(page.getByLabel('Currency')).toHaveValue('EUR');
    await expect(page.getByLabel('Start date')).toHaveValue('2026-11-01');
    await expect(page.getByLabel('Deadline')).toHaveValue('2026-12-31');
    await shot(page, testInfo, 'T01-all-fields-edit');
  });

  test('default currency from Settings is pre-selected (then reset)', async ({
    page,
    sessionA,
  }, testInfo) => {
    test.skip(isMobile(testInfo), 'mutates user A profile; desktop only');
    const token = tokenOf(sessionA);
    const uid = userIdOf(sessionA);
    try {
      const r = await rest(page, token, 'PATCH', `/rest/v1/profiles?id=eq.${uid}`, {
        default_currency: 'CHF',
      });
      expect(r.status).toBe(200);
      await page.goto('/projects/new');
      await expect(page.getByLabel('Currency')).toHaveValue('CHF');
      await shot(page, testInfo, 'T01-default-currency');
    } finally {
      const r = await rest(page, token, 'PATCH', `/rest/v1/profiles?id=eq.${uid}`, {
        default_currency: null,
      });
      expect(r.status).toBe(200);
    }
  });
});

test.describe('T-02 / AC-2 validation', () => {
  test('UI: missing required fields -> field errors + summary, nothing sent', async ({
    page,
  }, testInfo) => {
    let posts = 0;
    page.on('request', (r) => {
      if (r.url().includes('/rest/v1/projects') && r.method() === 'POST') posts++;
    });
    await page.goto('/projects/new');
    await page.getByRole('button', { name: 'Create project' }).click();
    const summary = page.getByRole('alert').filter({ hasText: 'There is a problem' });
    await expect(summary).toBeVisible();
    await expect(summary).toBeFocused();
    for (const msg of ['Enter a project title.', 'Enter the client name.', 'Choose a currency.'])
      await expect(summary.getByRole('link', { name: msg })).toBeVisible();
    await expect(page.getByLabel('Project title')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByLabel('Client name')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByLabel('Currency')).toHaveAttribute('aria-invalid', 'true');
    await shot(page, testInfo, 'T02-required');
    expect(posts).toBe(0);
  });

  test('UI: over-length, negative price, deadline before start -> field errors + summary, nothing sent', async ({
    page,
  }, testInfo) => {
    let posts = 0;
    page.on('request', (r) => {
      if (r.url().includes('/rest/v1/projects') && r.method() === 'POST') posts++;
    });
    await page.goto('/projects/new');
    await page.getByLabel('Project title').fill('t'.repeat(201));
    await page.getByLabel('Client name').fill('c'.repeat(201));
    await page.getByLabel('Client contact').fill('x'.repeat(321));
    await page.getByLabel('Description').fill('d'.repeat(5001));
    await page.getByLabel('Agreed price').fill('-5');
    await page.getByLabel('Currency').selectOption('EUR');
    await page.getByLabel('Start date').fill('2026-12-01');
    await page.getByLabel('Deadline').fill('2026-11-01');
    await page.getByRole('button', { name: 'Create project' }).click();
    const summary = page.getByRole('alert').filter({ hasText: 'There is a problem' });
    await expect(summary).toBeVisible();
    for (const msg of [
      'Use 200 characters or fewer.',
      'Use 320 characters or fewer.',
      'Use 5000 characters or fewer.',
      'Enter an amount like 1500 or 1500.50 (no negative values).',
      'The deadline must be on or after the start date.',
    ])
      await expect(summary.getByRole('link', { name: msg }).first()).toBeVisible();
    await expect(summary.getByRole('listitem')).toHaveCount(6); // title, client, contact, description, price, deadline
    await shot(page, testInfo, 'T02-invalid');
    expect(posts).toBe(0);
  });

  test('API: the same invalid payloads are rejected by the server', async ({ page, sessionA }) => {
    const token = tokenOf(sessionA);
    const base = { title: 'P2T api-invalid', client_name: 'C', currency: 'EUR' };
    const cases: [string, Record<string, unknown>, string][] = [
      ['missing title', { client_name: 'C', currency: 'EUR' }, '23502'],
      ['blank title', { ...base, title: '   ' }, '23514'],
      ['missing client', { title: 'T', currency: 'EUR' }, '23502'],
      ['missing currency', { title: 'T', client_name: 'C' }, '23502'],
      ['title 201', { ...base, title: 't'.repeat(201) }, '23514'],
      ['client 201', { ...base, client_name: 'c'.repeat(201) }, '23514'],
      ['contact 321', { ...base, client_contact: 'x'.repeat(321) }, '23514'],
      ['description 5001', { ...base, description: 'd'.repeat(5001) }, '23514'],
      ['negative price', { ...base, agreed_price: -1 }, '23514'],
      ['lowercase currency', { ...base, currency: 'eur' }, '23514'],
      [
        'deadline before start',
        { ...base, start_date: '2026-12-01', deadline: '2026-11-01' },
        '23514',
      ],
      ['owner_id spoof', { ...base, owner_id: '00000000-0000-0000-0000-000000000000' }, '42501'],
      ['status on insert', { ...base, status: 'archived' }, '42501'],
    ];
    const log: string[] = [];
    for (const [name, body, code] of cases) {
      const r = await rest(page, token, 'POST', '/rest/v1/projects', body);
      log.push(`${name}: HTTP ${r.status} ${(r.body as { code?: string })?.code}`);
      expect(r.status, name).toBeGreaterThanOrEqual(400);
      expect(r.status, name).toBeLessThan(500);
      expect((r.body as { code?: string }).code, name).toBe(code);
    }
    // Observation (not a criterion): 3-decimal price is rounded by numeric(14,2), not rejected.
    const r3 = await rest(page, token, 'POST', '/rest/v1/projects?select=id,agreed_price', {
      ...base,
      title: 'P2T api-3dp',
      agreed_price: 10.555,
    });
    log.push(`3-decimal price 10.555: HTTP ${r3.status} ${JSON.stringify(r3.body)}`);
    console.log(log.join('\n'));
  });
});

test.describe('T-03 / AC-3 edit, complete, archive, reopen', () => {
  test('lifecycle with list filters and read-only archived view', async ({ page }, testInfo) => {
    const title = uniq(testInfo, 'life');
    await page.goto('/projects/new');
    await page.getByLabel('Project title').fill(title);
    await page.getByLabel('Client name').fill('Life Client');
    await page.getByLabel('Currency').selectOption('USD');
    await page.getByRole('button', { name: 'Create project' }).click();
    await expect(page.getByText('Project created.')).toBeVisible();
    const url = page.url();
    const id = url.split('/').pop()!;

    // edit
    await page.getByRole('link', { name: 'Edit project' }).click();
    await page.getByLabel('Project title').fill(`${title} edited`);
    await page.getByLabel('Agreed price').fill('750');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('Project updated.')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: `${title} edited` })).toBeVisible();
    await expect(page.getByText('USD 750.00')).toBeVisible();

    // complete -> appears under Completed only; stays editable (BR-6)
    await page.getByRole('button', { name: 'Mark completed' }).click();
    await expect(page.getByText('Project marked as completed.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Edit project' })).toBeVisible();
    await page.goto('/projects');
    await expect(page.getByRole('heading', { level: 1, name: 'Projects' })).toBeVisible();
    await expect(page.getByRole('link', { name: new RegExp(`${title} edited`) })).toHaveCount(0);
    await page.goto('/projects?status=completed');
    await expect(page.getByRole('link', { name: new RegExp(`${title} edited`) })).toBeVisible();

    // reopen from completed, then archive
    await openProject(page, id);
    await page.getByRole('button', { name: 'Reopen' }).click();
    await expect(page.getByText('Project reopened.')).toBeVisible();
    await page.getByRole('button', { name: 'Archive' }).click();
    await expect(
      page.getByText('Project archived. It is read-only until you reopen it.'),
    ).toBeVisible();

    // archived: hidden from default list, visible under Archived filter
    await page.goto('/projects');
    await expect(page.getByRole('link', { name: 'Active', exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(page.getByRole('link', { name: new RegExp(`${title} edited`) })).toHaveCount(0);
    await page.getByRole('link', { name: 'Archived', exact: true }).click();
    await expect(page.getByRole('link', { name: new RegExp(`${title} edited`) })).toBeVisible();

    // read-only detail: no edit link, no draft editor, only Reopen
    await openProject(page, id);
    await expect(page.getByText('This project is archived and read-only.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Edit project' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: /Draft scope/ })).toHaveCount(0);
    await expect(page.getByRole('textbox')).toHaveCount(0);
    const buttons = page.getByRole('main').getByRole('button');
    await expect(buttons).toHaveText(['Reopen']);
    await shot(page, testInfo, 'T03-archived-readonly');

    // direct edit URL for an archived project is refused with the archived message
    await page.goto(`/projects/${id}/edit`);
    await expect(page.getByRole('main').getByRole('alert').first()).toBeVisible();
    // soft: a wrong message here is a defect, but the reopen steps below must still run
    await expect
      .soft(page.getByText('This project is archived. Reopen it to make changes.'))
      .toBeVisible();
    await expect(page.getByLabel('Project title')).toHaveCount(0);
    await shot(page, testInfo, 'T03-archived-edit-url');

    // reopen -> editable again
    await openProject(page, id);
    await page.getByRole('button', { name: 'Reopen' }).click();
    await expect(page.getByText('Project reopened.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Edit project' })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Draft scope/ })).toBeVisible();
  });
});

test.describe('§6 not found / not yours', () => {
  test('random id and another user\'s project show the same "Project not found" page', async ({
    page,
    browser,
  }, testInfo) => {
    const sessionB = await apiSession(browser, USER_B);
    const bId = await apiCreateProject(page, sessionB.access_token as string, {
      title: uniq(testInfo, 'B-owned'),
      client_name: 'B client',
      currency: 'EUR',
    });
    // keep B's dashboard count unaffected (T-09 runs in parallel): completed projects are not "active"
    expect(
      (
        await rest(
          page,
          sessionB.access_token as string,
          'PATCH',
          `/rest/v1/projects?id=eq.${bId}`,
          { status: 'completed' },
        )
      ).status,
    ).toBe(200);
    const texts: string[] = [];
    for (const id of ['3f1e0c5a-9a7b-4c1d-8e2f-0123456789ab', bId]) {
      await page.goto(`/projects/${id}`);
      const h1 = page.getByRole('heading', { level: 1 });
      await expect(h1).not.toHaveText('');
      await expect(page.getByRole('main').getByRole('alert').first()).toBeVisible();
      texts.push(await page.getByRole('main').innerText());
    }
    await shot(page, testInfo, 'S6-not-found');
    expect(texts[0]).toBe(texts[1]); // no existence leak
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Project not found');
  });

  test('malformed id also shows "Project not found"', async ({ page }, testInfo) => {
    await page.goto('/projects/not-a-uuid');
    await expect(page.getByRole('main').getByRole('alert').first()).toBeVisible();
    await shot(page, testInfo, 'S6-malformed-id');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Project not found');
  });
});

test.describe('T-09 / AC-9 dashboard', () => {
  test('active count before/after create, completed and archived excluded; New project action; max 5 listed', async ({
    page,
  }, testInfo) => {
    test.skip(
      isMobile(testInfo),
      'uses user B exclusively; desktop only to keep counts deterministic',
    );
    await page.goto('/sign-in');
    // this describe runs signed in as A via storageState; switch to B through the UI
    await page.evaluate(() => localStorage.clear());
    await page.goto('/sign-in');
    await signInViaUi(page, USER_B);
    await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
    const count = page.getByTestId('active-project-count');
    await expect(count).toHaveText('0');
    await expect(page.getByText('No projects yet')).toBeVisible();

    await page.getByRole('main').getByRole('link', { name: 'New project' }).click();
    await expect(page).toHaveURL(/\/projects\/new$/);
    const title = uniq(testInfo, 'dash');
    await page.getByLabel('Project title').fill(title);
    await page.getByLabel('Client name').fill('Dash Client');
    await page.getByLabel('Currency').selectOption('EUR');
    await page.getByRole('button', { name: 'Create project' }).click();
    await expect(page.getByText('Project created.')).toBeVisible();
    const id = page.url().split('/').pop()!;

    const token = await page.evaluate(() => {
      const k = Object.keys(localStorage).find((x) => x.endsWith('-auth-token'))!;
      return JSON.parse(localStorage.getItem(k)!).access_token as string;
    });
    // a completed project must not count
    const doneId = await apiCreateProject(page, token, {
      title: 'P2T dash-done',
      client_name: 'C',
      currency: 'EUR',
    });
    expect(
      (
        await rest(page, token, 'PATCH', `/rest/v1/projects?id=eq.${doneId}`, {
          status: 'completed',
        })
      ).status,
    ).toBe(200);

    await page.goto('/');
    await expect(count).toHaveText('1');
    await expect(page.getByRole('link', { name: new RegExp(title) })).toBeVisible();
    await shot(page, testInfo, 'T09-dashboard-1');

    // archive via UI -> 0
    await openProject(page, id);
    await page.getByRole('button', { name: 'Archive' }).click();
    await expect(page.getByText(/Project archived/)).toBeVisible();
    await page.goto('/');
    await expect(count).toHaveText('0');

    // 6 active -> count 6, 5 listed + "View all"
    for (let i = 1; i <= 6; i++)
      await apiCreateProject(page, token, {
        title: `P2T dash-bulk ${i}`,
        client_name: 'C',
        currency: 'EUR',
      });
    await page.goto('/');
    await expect(count).toHaveText('6');
    await expect(
      page.getByRole('region', { name: 'Recently updated' }).getByRole('listitem'),
    ).toHaveCount(5);
    await expect(page.getByRole('link', { name: 'View all active projects' })).toBeVisible();
    await shot(page, testInfo, 'T09-dashboard-6');
  });
});
