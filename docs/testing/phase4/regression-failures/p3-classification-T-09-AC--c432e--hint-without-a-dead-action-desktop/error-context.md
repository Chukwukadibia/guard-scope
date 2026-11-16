# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: p3-classification.spec.ts >> T-09 / AC-9 no money; Phase 4 hint; BR-6 wording >> Included shows no value; Additional shows the hint without a dead action
- Location: tests/e2e/p3-classification.spec.ts:328:3

# Error details

```
Error: expect(received).not.toMatch(expected)

Expected pattern: not /EUR|USD|€|\$|£|1,?234|price|revenue|earned|paid|value|amount/i
Received string:      "← P3T money desktop klokyf
Additional one

Received 16 Nov 2026

Additional
Request details
Edit request
Details
None recorded.
Private notes
Private — never shown to your client.
None.
Compare with your recorded scope

Original agreement, confirmed 16 Nov 2026, 22:09 UTC.

Deliverables
Five-page website
Not included (exclusions)
Copywriting
Your decision

You decide how this request relates to the agreement. GuardScope doesn't make legal judgements.

Included
Additional
Needs clarification

You marked this as outside the agreement. It can become a change proposal once change orders are available.

Change proposal

Turn this request into a priced and/or timed proposal for your client.

Create change proposal
History
Request recorded: Additional one
16 Nov 2026, 22:09 UTC
Marked \"Additional one\" as Additional
Changed from
Not classified yet →
to
 Additional
16 Nov 2026, 22:09 UTC"
```

# Page snapshot

```yaml
- generic [ref=f2e3]:
  - link "Skip to main content" [ref=f2e4] [cursor=pointer]:
    - /url: "#main"
  - banner [ref=f2e5]:
    - generic [ref=f2e6]:
      - link "GuardScope, go to dashboard" [ref=f2e7] [cursor=pointer]:
        - /url: /
        - generic [ref=f2e8]: GuardScope
      - navigation "Main" [ref=f2e12]:
        - list [ref=f2e13]:
          - listitem [ref=f2e14]:
            - link "Dashboard" [ref=f2e15] [cursor=pointer]:
              - /url: /
          - listitem [ref=f2e21]:
            - link "Projects" [ref=f2e22] [cursor=pointer]:
              - /url: /projects
          - listitem [ref=f2e25]:
            - link "Settings" [ref=f2e26] [cursor=pointer]:
              - /url: /settings
          - listitem [ref=f2e30]:
            - button "Sign out" [ref=f2e31]
  - main [ref=f2e35]:
    - generic [ref=f2e36]:
      - generic [ref=f2e37]:
        - link "← P3T money desktop klokyf" [ref=f2e38] [cursor=pointer]:
          - /url: /projects/912c65a3-7bef-4dd2-b9af-d8c91037cbc2#requests
        - generic [ref=f2e39]:
          - generic [ref=f2e40]:
            - heading "Additional one" [level=1] [ref=f2e41]
            - paragraph [ref=f2e42]: Received 16 Nov 2026
          - generic [ref=f2e43]: Additional
      - region "Request details" [ref=f2e46]:
        - generic [ref=f2e47]:
          - heading "Request details" [level=2] [ref=f2e48]
          - button "Edit request" [ref=f2e49]
        - generic [ref=f2e53]:
          - generic [ref=f2e54]:
            - term [ref=f2e55]: Details
            - definition [ref=f2e56]: None recorded.
          - generic [ref=f2e57]:
            - term [ref=f2e58]: Private notes
            - definition [ref=f2e59]: Private — never shown to your client.
            - definition [ref=f2e60]: None.
      - region "Compare with your recorded scope" [ref=f2e61]:
        - heading "Compare with your recorded scope" [level=2] [ref=f2e62]
        - paragraph [ref=f2e63]: Original agreement, confirmed 16 Nov 2026, 22:09 UTC.
        - generic [ref=f2e64]:
          - generic [ref=f2e65]:
            - heading "Deliverables" [level=3] [ref=f2e66]
            - list [ref=f2e67]:
              - listitem [ref=f2e68]: Five-page website
          - generic [ref=f2e69]:
            - heading "Not included (exclusions)" [level=3] [ref=f2e70]
            - list [ref=f2e71]:
              - listitem [ref=f2e72]: Copywriting
      - region "Your decision" [ref=f2e73]:
        - heading "Your decision" [level=2] [ref=f2e74]
        - paragraph [ref=f2e75]: You decide how this request relates to the agreement. GuardScope doesn't make legal judgements.
        - group "Classify this request" [ref=f2e76]:
          - button "Included" [ref=f2e77]
          - button "Additional" [pressed] [ref=f2e78]
          - button "Needs clarification" [ref=f2e79]
        - paragraph [ref=f2e80]: You marked this as outside the agreement. It can become a change proposal once change orders are available.
      - region "Change proposal" [ref=f2e81]:
        - heading "Change proposal" [level=2] [ref=f2e82]
        - paragraph [ref=f2e83]: Turn this request into a priced and/or timed proposal for your client.
        - button "Create change proposal" [ref=f2e84]
      - region "History" [ref=f2e85]:
        - heading "History" [level=2] [ref=f2e86]
        - list [ref=f2e87]:
          - listitem [ref=f2e88]:
            - generic [ref=f2e89]: "Request recorded: Additional one"
            - generic [ref=f2e90]: 16 Nov 2026, 22:09 UTC
          - listitem [ref=f2e91]:
            - generic [ref=f2e92]: Marked "Additional one" as Additional
            - generic [ref=f2e93]:
              - generic [ref=f2e94]: Changed from
              - text: Not classified yet →
              - generic [ref=f2e95]: to
              - text: Additional
            - generic [ref=f2e96]: 16 Nov 2026, 22:09 UTC
```

# Test source

```ts
  253 |       'GET',
  254 |       `/rest/v1/requests?select=classification&id=eq.${rid}`,
  255 |     );
  256 |     const finalValue = (row.body as { classification: string }[])[0].classification;
  257 |     const chain = ev.map((e) => [e.metadata.from as string, e.metadata.to as string]);
  258 |     logEvidence('api-T03-concurrency.jsonl', testInfo, 'chain', {
  259 |       requestId: rid,
  260 |       same,
  261 |       mixed,
  262 |       sent: Array.from({ length: 12 }, (_, i) => vals[i % 3]),
  263 |       historyRows: ev.map((e) => ({
  264 |         id: e.id,
  265 |         created_at: e.created_at,
  266 |         from: e.metadata.from,
  267 |         to: e.metadata.to,
  268 |         summary: e.summary,
  269 |       })),
  270 |       chain,
  271 |       finalValue,
  272 |     });
  273 |     // Integrity (hard): no self-transitions, and the transitions form one unbroken path
  274 |     // unclassified -> ... -> stored value (Eulerian path check, order-independent).
  275 |     for (const [f, t] of chain) expect(f).not.toBe(t);
  276 |     const bal: Record<string, number> = {};
  277 |     for (const [f, t] of chain) {
  278 |       bal[f] = (bal[f] ?? 0) - 1;
  279 |       bal[t] = (bal[t] ?? 0) + 1;
  280 |     }
  281 |     const expectedBal: Record<string, number> = {};
  282 |     if (finalValue !== 'unclassified') {
  283 |       expectedBal.unclassified = -1;
  284 |       expectedBal[finalValue] = 1;
  285 |     }
  286 |     for (const k of Object.keys(bal)) if (bal[k] === 0) delete bal[k];
  287 |     expect(bal).toEqual(expectedBal);
  288 |     expect(chain.filter(([f]) => f === 'unclassified')).toHaveLength(1);
  289 |     // Order (hard since retest 1, D-2 / ISS-015): read in the app's order (seq), each entry's "from"
  290 |     // equals the previous entry's "to", and the last entry equals the stored value.
  291 |     expect(chain[0][0], 'first event starts from unclassified').toBe('unclassified');
  292 |     for (let i = 1; i < chain.length; i++)
  293 |       expect(chain[i][0], `history order: link ${i}`).toBe(chain[i - 1][1]);
  294 |     expect(chain[chain.length - 1][1], 'last entry matches stored value').toBe(finalValue);
  295 |     // seq strictly increasing and unique; created_at order agrees with seq order.
  296 |     const all = await apiEvents(page, token, rid);
  297 |     for (let i = 1; i < all.length; i++) {
  298 |       expect(all[i].seq, `seq increases at ${i}`).toBeGreaterThan(all[i - 1].seq);
  299 |       expect(
  300 |         micros(all[i].created_at),
  301 |         `created_at non-decreasing in seq order at ${i}`,
  302 |       ).toBeGreaterThanOrEqual(micros(all[i - 1].created_at));
  303 |     }
  304 |     expect(new Set(all.map((e) => e.id)).size).toBe(all.length);
  305 |     expect(all.filter((e) => e.event_type === 'request.created')).toHaveLength(1);
  306 |     expect(all[0].event_type).toBe('request.created');
  307 |     logEvidence('api-T03-concurrency-retest1.jsonl', testInfo, 'seq order', {
  308 |       requestId: rid,
  309 |       finalValue,
  310 |       events: all.map((e) => ({
  311 |         seq: e.seq,
  312 |         created_at: e.created_at,
  313 |         type: e.event_type,
  314 |         from: e.metadata.from,
  315 |         to: e.metadata.to,
  316 |       })),
  317 |     });
  318 |     // UI: the request page shows the stored value and a history whose last entry ends at it.
  319 |     await openRequest(page, pid, rid);
  320 |     const items = historyRegion(page).getByRole('listitem');
  321 |     await expect(items).toHaveCount(all.length);
  322 |     await expect(items.last()).toContainText(`to ${label[finalValue]}`);
  323 |     await expect(page.locator('h1').locator('..').locator('..')).toContainText(label[finalValue]);
  324 |   });
  325 | });
  326 | 
  327 | test.describe('T-09 / AC-9 no money; Phase 4 hint; BR-6 wording', () => {
  328 |   test('Included shows no value; Additional shows the hint without a dead action', async ({
  329 |     page,
  330 |     sessionA,
  331 |   }, testInfo) => {
  332 |     const token = tokenOf(sessionA);
  333 |     const pid = await apiConfirmedProject(page, token, uniq3(testInfo, 'money'));
  334 |     const inc = await apiCreateRequest(page, token, pid, { title: 'Included one' });
  335 |     const add = await apiCreateRequest(page, token, pid, { title: 'Additional one' });
  336 |     const clar = await apiCreateRequest(page, token, pid, { title: 'Unclear one' });
  337 |     await apiClassify(page, token, inc, 'included');
  338 |     await apiClassify(page, token, add, 'additional');
  339 |     await apiClassify(page, token, clar, 'needs_clarification');
  340 |     const money = /EUR|USD|€|\$|£|1,?234|price|revenue|earned|paid|value|amount/i;
  341 | 
  342 |     await openRequest(page, pid, inc);
  343 |     await expect(
  344 |       page.getByText('You marked this as covered by the agreement or the remaining revisions.'),
  345 |     ).toBeVisible();
  346 |     expect(await page.locator('main').innerText()).not.toMatch(money);
  347 |     await shot3(page, testInfo, 'T09-included');
  348 | 
  349 |     await openRequest(page, pid, add);
  350 |     const decision = page.getByRole('region', { name: 'Your decision' });
  351 |     await expect(decision).toContainText('You marked this as outside the agreement.');
  352 |     await expect(decision).toContainText(/change proposal once change orders are available/);
> 353 |     expect(await page.locator('main').innerText()).not.toMatch(money);
      |                                                        ^ Error: expect(received).not.toMatch(expected)
  354 |     await expect(page.getByRole('button', { name: /change (order|proposal)/i })).toHaveCount(0);
  355 |     await expect(page.getByRole('link', { name: /change (order|proposal)/i })).toHaveCount(0);
  356 |     await shot3(page, testInfo, 'T09-additional');
  357 | 
  358 |     await openRequest(page, pid, clar);
  359 |     await expect(page.getByText('You need more information before deciding.')).toBeVisible();
  360 | 
  361 |     // BR-6: no legal conclusions anywhere on these pages
  362 |     for (const r of [inc, add, clar]) {
  363 |       await openRequest(page, pid, r);
  364 |       const text = await page.locator('main').innerText();
  365 |       expect(text).not.toMatch(/legally|out of scope|in scope|breach|you are owed|client owes/i);
  366 |     }
  367 | 
  368 |     // Project page: request list and revisions show no money beyond the project's own agreed price
  369 |     await openProject(page, pid);
  370 |     expect(await page.getByRole('region', { name: 'Client requests' }).innerText()).not.toMatch(
  371 |       money,
  372 |     );
  373 |     expect(await page.getByRole('region', { name: 'Revisions' }).innerText()).not.toMatch(money);
  374 |   });
  375 | });
  376 | 
```