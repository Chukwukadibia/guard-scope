# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: settings-and-empty-states.spec.ts >> T-16 / AC-12 empty states, no dead actions >> / shows "No projects yet" and no non-functional actions
- Location: tests/e2e/settings-and-empty-states.spec.ts:135:5

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('heading', { name: 'No projects yet', level: 2 })
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" getByRole('heading', { name: 'No projects yet', level: 2 }) with timeout 5000ms
  - waiting for getByRole('heading', { name: 'No projects yet', level: 2 })

```

```yaml
- link "Skip to main content":
  - /url: "#main"
- banner:
  - link "GuardScope, go to dashboard":
    - /url: /
    - text: GuardScope
  - button "Open menu"
- main:
  - heading "Dashboard" [level=1]
  - link "New project":
    - /url: /projects/new
  - region "Active projects":
    - heading "Active projects" [level=2]
    - paragraph: "1"
  - region "Recently updated":
    - heading "Recently updated" [level=2]
    - list:
      - listitem:
        - 'link "P4T ui-closed mobile aeulm9 P4 Client Deadline: Not set"':
          - /url: /projects/2f1029d2-96de-409d-9545-21a299a7132d
```

# Test source

```ts
  59  |       await saveSettings(page);
  60  |       await page.reload();
  61  |       await expect(page.getByLabel(/Display or business name/)).toHaveValue('');
  62  |       await expect(page.getByLabel(/Default currency/)).toHaveValue('');
  63  |     }
  64  |   });
  65  | });
  66  | 
  67  | test.describe('T-12 / AC-8 settings validation', () => {
  68  |   test('121-character name gives a field error linked via aria-describedby; nothing is sent', async ({
  69  |     page,
  70  |   }, testInfo) => {
  71  |     await page.goto('/settings');
  72  |     const name = page.getByLabel(/Display or business name/);
  73  |     await expect(name).toBeVisible();
  74  |     let patches = 0;
  75  |     page.on('request', (r) => {
  76  |       if (r.url().includes('/rest/v1/profiles') && r.method() === 'PATCH') patches++;
  77  |     });
  78  |     await name.fill('x'.repeat(121));
  79  |     await expect(name).toHaveValue('x'.repeat(121));
  80  |     await page.getByRole('button', { name: 'Save settings' }).click();
  81  |     const err = await inlineError(page, name, 'Use 120 characters or fewer.');
  82  |     await expect(err).toBeVisible();
  83  |     const errId = await err.getAttribute('id');
  84  |     expect(errId).toBeTruthy();
  85  |     expect((await name.getAttribute('aria-describedby'))?.split(' ')).toContain(errId);
  86  |     expect(patches).toBe(0);
  87  |     await screenshot(page, testInfo, 'T12-name-too-long');
  88  |   });
  89  | 
  90  |   test('currency not in the list gives a field error linked via aria-describedby', async ({
  91  |     page,
  92  |   }) => {
  93  |     await page.goto('/settings');
  94  |     const currency = page.getByLabel(/Default currency/);
  95  |     await expect(currency).toBeVisible();
  96  |     // Simulate a tampered/unknown option (cannot be chosen through the normal list).
  97  |     await currency.evaluate((el) => {
  98  |       const o = document.createElement('option');
  99  |       o.value = 'ZZZ';
  100 |       o.textContent = 'ZZZ';
  101 |       el.appendChild(o);
  102 |     });
  103 |     await currency.selectOption('ZZZ');
  104 |     await page.getByRole('button', { name: 'Save settings' }).click();
  105 |     const err = await inlineError(page, currency, 'Choose a currency from the list.');
  106 |     await expect(err).toBeVisible();
  107 |     expect((await currency.getAttribute('aria-describedby'))?.split(' ')).toContain(
  108 |       await err.getAttribute('id'),
  109 |     );
  110 |   });
  111 | 
  112 |   test('§6: validation errors are summarised on submit', async ({ page }) => {
  113 |     await page.goto('/settings');
  114 |     const name = page.getByLabel(/Display or business name/);
  115 |     await name.fill('x'.repeat(121));
  116 |     await page.getByRole('button', { name: 'Save settings' }).click();
  117 |     await expect(await inlineError(page, name, 'Use 120 characters or fewer.')).toBeVisible();
  118 |     // A submit summary is an alert/status region in addition to the inline field message.
  119 |     const summary = page
  120 |       .getByRole('alert')
  121 |       .or(page.locator('[role="status"]'))
  122 |       .filter({ hasText: /120 characters|check|error/i });
  123 |     await expect(summary).toHaveCount(1, { timeout: 2000 });
  124 |   });
  125 | });
  126 | 
  127 | test.describe('T-16 / AC-12 empty states, no dead actions', () => {
  128 |   // ISS-013 / P2 D-5: Phase 2 FEATURE_SPEC §6 (approved, HA-004) replaces the Phase 1 `/projects`
  129 |   // placeholder ("Projects will appear here") with an empty state that has a create action. The
  130 |   // Phase 1 intent is kept: an empty state is shown and every action in it works (no dead actions).
  131 |   for (const [path, heading, emptyTitle] of [
  132 |     ['/', 'Dashboard', 'No projects yet'],
  133 |     ['/projects', 'Projects', 'No active projects'],
  134 |   ] as const) {
  135 |     test(`${path} shows "${emptyTitle}" and no non-functional actions`, async ({
  136 |       page,
  137 |       sessionA,
  138 |     }, testInfo) => {
  139 |       test.setTimeout(180_000);
  140 |       // Precondition: an empty state needs user A to have no active projects. In a full-suite run
  141 |       // Phase 2 specs (which archive their projects after each test) may still be running in the
  142 |       // other worker, so wait for the precondition instead of racing it.
  143 |       await expect
  144 |         .poll(
  145 |           async () => {
  146 |             const r = await rest(
  147 |               page,
  148 |               sessionA.access_token as string,
  149 |               'GET',
  150 |               '/rest/v1/projects?select=id&status=eq.active',
  151 |             );
  152 |             return r.status === 200 ? (r.body as unknown[]).length : -1;
  153 |           },
  154 |           { timeout: 120_000, message: 'user A still has active projects' },
  155 |         )
  156 |         .toBe(0);
  157 |       await page.goto(path);
  158 |       await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
> 159 |       await expect(page.getByRole('heading', { level: 2, name: emptyTitle })).toBeVisible();
      |                                                                               ^ Error: expect(locator).toBeVisible() failed
  160 |       const main = page.locator('main');
  161 |       await expect(main.getByRole('button')).toHaveCount(0);
  162 |       const hrefs = await main
  163 |         .getByRole('link')
  164 |         .evaluateAll((els) => els.map((e) => e.getAttribute('href')));
  165 |       for (const h of hrefs) expect(h && h !== '#' && !h.startsWith('javascript:')).toBeTruthy();
  166 |       await screenshot(page, testInfo, `T16-${heading.toLowerCase()}`);
  167 |       if (path === '/projects') {
  168 |         // Phase 2 §6: the empty state itself offers a working create action.
  169 |         const empty = main.locator('section').filter({
  170 |           has: page.getByRole('heading', { level: 2, name: emptyTitle }),
  171 |         });
  172 |         const create = empty.getByRole('link', { name: 'New project' });
  173 |         await expect(create).toHaveCount(1);
  174 |         await expect(create).toHaveAttribute('href', '/projects/new');
  175 |         await create.click();
  176 |         await expect(page).toHaveURL(/\/projects\/new$/);
  177 |         await expect(page.getByLabel('Project title')).toBeVisible();
  178 |       }
  179 |     });
  180 |   }
  181 | });
  182 | 
```