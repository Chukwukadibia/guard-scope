# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: p2-a11y.spec.ts >> T-11 axe + overflow on every Phase 2 page and state
- Location: tests/e2e/p2-a11y.spec.ts:33:1

# Error details

```
Error: {"dashboard":0,"projects-list":0,"projects-archived":0,"projects-completed":0,"project-form":0,"project-form-errors":0,"project-edit":0,"detail-draft-editor":0,"confirm-dialog":0,"confirm-dialog-error":1,"detail-baseline-current-draft-long-text":0,"detail-archived":0,"project-not-found":0,"settings-delete-open-error":0}

expect(received).toBe(expected) // Object.is equality

Expected: true
Received: false
```

# Page snapshot

```yaml
- generic [ref=f11e3]:
  - link "Skip to main content" [ref=f11e4] [cursor=pointer]:
    - /url: "#main"
  - banner [ref=f11e5]:
    - generic [ref=f11e6]:
      - link "GuardScope, go to dashboard" [ref=f11e7] [cursor=pointer]:
        - /url: /
        - generic [ref=f11e8]: GuardScope
      - navigation "Main" [ref=f11e12]:
        - list [ref=f11e13]:
          - listitem [ref=f11e14]:
            - link "Dashboard" [ref=f11e15] [cursor=pointer]:
              - /url: /
          - listitem [ref=f11e21]:
            - link "Projects" [ref=f11e22] [cursor=pointer]:
              - /url: /projects
          - listitem [ref=f11e25]:
            - link "Settings" [ref=f11e26] [cursor=pointer]:
              - /url: /settings
          - listitem [ref=f11e30]:
            - button "Sign out" [ref=f11e31]
  - main [ref=f11e35]:
    - generic [ref=f11e36]:
      - heading "Settings" [level=1] [ref=f11e37]
      - region "Account" [ref=f11e38]:
        - heading "Account" [level=2] [ref=f11e39]
        - generic [ref=f11e40]:
          - term [ref=f11e41]: Signed in as
          - definition [ref=f11e42]: a@guardscope.test
      - region "Profile" [ref=f11e43]:
        - heading "Profile" [level=2] [ref=f11e44]
        - generic [ref=f11e45]:
          - generic [ref=f11e46]:
            - generic [ref=f11e47]: Display or business name (optional)
            - textbox "Display or business name (optional)" [ref=f11e48]
            - paragraph [ref=f11e49]: Shown to your clients on proposals.
          - generic [ref=f11e50]:
            - generic [ref=f11e51]: Default currency (optional)
            - combobox "Default currency (optional)" [ref=f11e52]:
              - option "Not set" [selected]
              - option "AED — United Arab Emirates Dirham"
              - option "AFN — Afghan Afghani"
              - option "ALL — Albanian Lek"
              - option "AMD — Armenian Dram"
              - option "ANG — Netherlands Antillean Guilder"
              - option "AOA — Angolan Kwanza"
              - option "ARS — Argentine Peso"
              - option "AUD — Australian Dollar"
              - option "AWG — Aruban Florin"
              - option "AZN — Azerbaijani Manat"
              - option "BAM — Bosnia-Herzegovina Convertible Mark"
              - option "BBD — Barbadian Dollar"
              - option "BDT — Bangladeshi Taka"
              - option "BGN — Bulgarian Lev"
              - option "BHD — Bahraini Dinar"
              - option "BIF — Burundian Franc"
              - option "BMD — Bermudan Dollar"
              - option "BND — Brunei Dollar"
              - option "BOB — Bolivian Boliviano"
              - option "BRL — Brazilian Real"
              - option "BSD — Bahamian Dollar"
              - option "BTN — Bhutanese Ngultrum"
              - option "BWP — Botswanan Pula"
              - option "BYN — Belarusian Ruble"
              - option "BZD — Belize Dollar"
              - option "CAD — Canadian Dollar"
              - option "CDF — Congolese Franc"
              - option "CHF — Swiss Franc"
              - option "CLP — Chilean Peso"
              - option "CNY — Chinese Yuan"
              - option "COP — Colombian Peso"
              - option "CRC — Costa Rican Colón"
              - option "CUC — Cuban Convertible Peso"
              - option "CUP — Cuban Peso"
              - option "CVE — Cape Verdean Escudo"
              - option "CZK — Czech Koruna"
              - option "DJF — Djiboutian Franc"
              - option "DKK — Danish Krone"
              - option "DOP — Dominican Peso"
              - option "DZD — Algerian Dinar"
              - option "EGP — Egyptian Pound"
              - option "ERN — Eritrean Nakfa"
              - option "ETB — Ethiopian Birr"
              - option "EUR — Euro"
              - option "FJD — Fijian Dollar"
              - option "FKP — Falkland Islands Pound"
              - option "GBP — British Pound"
              - option "GEL — Georgian Lari"
              - option "GHS — Ghanaian Cedi"
              - option "GIP — Gibraltar Pound"
              - option "GMD — Gambian Dalasi"
              - option "GNF — Guinean Franc"
              - option "GTQ — Guatemalan Quetzal"
              - option "GYD — Guyanaese Dollar"
              - option "HKD — Hong Kong Dollar"
              - option "HNL — Honduran Lempira"
              - option "HRK — Croatian Kuna"
              - option "HTG — Haitian Gourde"
              - option "HUF — Hungarian Forint"
              - option "IDR — Indonesian Rupiah"
              - option "ILS — Israeli New Shekel"
              - option "INR — Indian Rupee"
              - option "IQD — Iraqi Dinar"
              - option "IRR — Iranian Rial"
              - option "ISK — Icelandic Króna"
              - option "JMD — Jamaican Dollar"
              - option "JOD — Jordanian Dinar"
              - option "JPY — Japanese Yen"
              - option "KES — Kenyan Shilling"
              - option "KGS — Kyrgyz Som"
              - option "KHR — Cambodian Riel"
              - option "KMF — Comorian Franc"
              - option "KPW — North Korean Won"
              - option "KRW — South Korean Won"
              - option "KWD — Kuwaiti Dinar"
              - option "KYD — Cayman Islands Dollar"
              - option "KZT — Kazakhstani Tenge"
              - option "LAK — Laotian Kip"
              - option "LBP — Lebanese Pound"
              - option "LKR — Sri Lankan Rupee"
              - option "LRD — Liberian Dollar"
              - option "LSL — Lesotho Loti"
              - option "LYD — Libyan Dinar"
              - option "MAD — Moroccan Dirham"
              - option "MDL — Moldovan Leu"
              - option "MGA — Malagasy Ariary"
              - option "MKD — Macedonian Denar"
              - option "MMK — Myanmar Kyat"
              - option "MNT — Mongolian Tugrik"
              - option "MOP — Macanese Pataca"
              - option "MRU — Mauritanian Ouguiya"
              - option "MUR — Mauritian Rupee"
              - option "MVR — Maldivian Rufiyaa"
              - option "MWK — Malawian Kwacha"
              - option "MXN — Mexican Peso"
              - option "MYR — Malaysian Ringgit"
              - option "MZN — Mozambican Metical"
              - option "NAD — Namibian Dollar"
              - option "NGN — Nigerian Naira"
              - option "NIO — Nicaraguan Córdoba"
              - option "NOK — Norwegian Krone"
              - option "NPR — Nepalese Rupee"
              - option "NZD — New Zealand Dollar"
              - option "OMR — Omani Rial"
              - option "PAB — Panamanian Balboa"
              - option "PEN — Peruvian Sol"
              - option "PGK — Papua New Guinean Kina"
              - option "PHP — Philippine Peso"
              - option "PKR — Pakistani Rupee"
              - option "PLN — Polish Zloty"
              - option "PYG — Paraguayan Guarani"
              - option "QAR — Qatari Riyal"
              - option "RON — Romanian Leu"
              - option "RSD — Serbian Dinar"
              - option "RUB — Russian Ruble"
              - option "RWF — Rwandan Franc"
              - option "SAR — Saudi Riyal"
              - option "SBD — Solomon Islands Dollar"
              - option "SCR — Seychellois Rupee"
              - option "SDG — Sudanese Pound"
              - option "SEK — Swedish Krona"
              - option "SGD — Singapore Dollar"
              - option "SHP — St. Helena Pound"
              - option "SLL — Sierra Leonean Leone (1964—2022)"
              - option "SOS — Somali Shilling"
              - option "SRD — Surinamese Dollar"
              - option "SSP — South Sudanese Pound"
              - option "STN — São Tomé & Príncipe Dobra"
              - option "SVC — Salvadoran Colón"
              - option "SYP — Syrian Pound"
              - option "SZL — Swazi Lilangeni"
              - option "THB — Thai Baht"
              - option "TJS — Tajikistani Somoni"
              - option "TMT — Turkmenistani Manat"
              - option "TND — Tunisian Dinar"
              - option "TOP — Tongan Paʻanga"
              - option "TRY — Turkish Lira"
              - option "TTD — Trinidad & Tobago Dollar"
              - option "TWD — New Taiwan Dollar"
              - option "TZS — Tanzanian Shilling"
              - option "UAH — Ukrainian Hryvnia"
              - option "UGX — Ugandan Shilling"
              - option "USD — US Dollar"
              - option "UYU — Uruguayan Peso"
              - option "UZS — Uzbekistani Som"
              - option "VES — Venezuelan Bolívar"
              - option "VND — Vietnamese Dong"
              - option "VUV — Vanuatu Vatu"
              - option "WST — Samoan Tala"
              - option "XAF — Central African CFA Franc"
              - option "XCD — East Caribbean Dollar"
              - option "XDR — Special Drawing Rights"
              - option "XOF — West African CFA Franc"
              - option "XPF — CFP Franc"
              - option "XSU — Sucre"
              - option "YER — Yemeni Rial"
              - option "ZAR — South African Rand"
              - option "ZMW — Zambian Kwacha"
              - option "ZWL — Zimbabwean Dollar (2009–2024)"
            - paragraph [ref=f11e53]: Pre-selected when you create a project. You can choose a different currency per project.
          - button "Save settings" [ref=f11e54]
      - region "Delete account" [ref=f11e55]:
        - heading "Delete account" [level=2] [ref=f11e56]
        - paragraph [ref=f11e57]: This permanently deletes your account, profile, projects and recorded scope. It can't be undone, and GuardScope can't recover it. Download or copy anything you need first.
        - generic [ref=f11e58]:
          - alert [active] [ref=f11e59]:
            - heading "There is a problem" [level=3] [ref=f11e60]
            - list [ref=f11e63]:
              - listitem [ref=f11e64]:
                - link "Enter your password to confirm." [ref=f11e65] [cursor=pointer]:
                  - /url: "#delete-account-password"
          - generic [ref=f11e66]:
            - generic [ref=f11e67]: Your password
            - textbox "Your password" [invalid] [ref=f11e68]
            - paragraph [ref=f11e69]: Required to confirm it's you.
            - paragraph [ref=f11e70]: ⚠ Enter your password to confirm.
          - generic [ref=f11e71]:
            - button "Permanently delete account" [ref=f11e72]
            - button "Cancel" [ref=f11e73]
```

# Test source

```ts
  62  |   await apiAddItem(page, token, v1, 'deliverable', 'D'.repeat(1000));
  63  |   await apiAddItem(page, token, v1, 'exclusion', 'E'.repeat(1000));
  64  |   await apiAddItem(page, token, v1, 'assumption', 'A'.repeat(1000));
  65  |   expect(
  66  |     (
  67  |       await rest(page, token, 'PATCH', `/rest/v1/scope_versions?id=eq.${v1}`, {
  68  |         summary: 'S'.repeat(5000),
  69  |         notes: 'N'.repeat(5000),
  70  |       })
  71  |     ).status,
  72  |   ).toBe(200);
  73  |   expect(
  74  |     (await rest(page, token, 'POST', '/rest/v1/rpc/confirm_scope', { p_version_id: v1 })).status,
  75  |   ).toBe(200);
  76  |   const v2 = await apiDraftId(page, token, pid);
  77  |   expect(
  78  |     (await rest(page, token, 'POST', '/rest/v1/rpc/confirm_scope', { p_version_id: v2 })).status,
  79  |   ).toBe(200);
  80  |   expect(
  81  |     (await rest(page, token, 'PATCH', `/rest/v1/projects?id=eq.${pid}`, { agreed_price: 5 }))
  82  |       .status,
  83  |   ).toBe(200);
  84  | 
  85  |   const draftPid = await apiCreateProject(page, token, {
  86  |     title: uniq(testInfo, 'a11y-draft'),
  87  |     client_name: 'C',
  88  |     currency: 'EUR',
  89  |   });
  90  |   const archPid = await apiCreateProject(page, token, {
  91  |     title: uniq(testInfo, 'a11y-arch'),
  92  |     client_name: 'C',
  93  |     currency: 'EUR',
  94  |   });
  95  |   expect(
  96  |     (await rest(page, token, 'PATCH', `/rest/v1/projects?id=eq.${archPid}`, { status: 'archived' }))
  97  |       .status,
  98  |   ).toBe(200);
  99  | 
  100 |   await page.goto('/');
  101 |   await expect(page.getByTestId('active-project-count')).toBeVisible();
  102 |   await check('dashboard');
  103 | 
  104 |   await page.goto('/projects');
  105 |   await expect(page.getByRole('heading', { level: 1, name: 'Projects' })).toBeVisible();
  106 |   await expect(page.getByRole('main').getByRole('listitem').first()).toBeVisible();
  107 |   await check('projects-list');
  108 | 
  109 |   await page.goto('/projects?status=archived');
  110 |   await expect(page.getByRole('main').getByRole('listitem').first()).toBeVisible();
  111 |   await check('projects-archived');
  112 | 
  113 |   await page.goto('/projects?status=completed');
  114 |   await expect(page.getByText(/No completed projects|Completed/).first()).toBeVisible();
  115 |   await check('projects-completed');
  116 | 
  117 |   await page.goto('/projects/new');
  118 |   await expect(page.getByLabel('Project title')).toBeVisible();
  119 |   await check('project-form');
  120 |   await page.getByRole('button', { name: 'Create project' }).click();
  121 |   await expect(page.getByRole('alert').filter({ hasText: 'There is a problem' })).toBeVisible();
  122 |   await check('project-form-errors');
  123 | 
  124 |   await page.goto(`/projects/${pid}/edit`);
  125 |   await expect(page.getByLabel('Project title')).toHaveValue(longTitle);
  126 |   await check('project-edit');
  127 | 
  128 |   await openProject(page, draftPid);
  129 |   await check('detail-draft-editor');
  130 |   await page.getByRole('button', { name: 'Confirm original scope' }).click();
  131 |   await expect(page.getByRole('group', { name: 'Confirm original scope?' })).toBeVisible();
  132 |   await check('confirm-dialog');
  133 |   await page.getByRole('button', { name: 'Yes, confirm' }).click();
  134 |   await expect(page.getByRole('group').getByRole('alert')).toBeVisible();
  135 |   await check('confirm-dialog-error');
  136 | 
  137 |   await openProject(page, pid);
  138 |   await expect(page.getByRole('heading', { name: /Current scope/ })).toBeVisible();
  139 |   await check('detail-baseline-current-draft-long-text');
  140 | 
  141 |   await openProject(page, archPid);
  142 |   await check('detail-archived');
  143 | 
  144 |   await page.goto('/projects/3f1e0c5a-9a7b-4c1d-8e2f-0123456789ab');
  145 |   await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  146 |   await check('project-not-found');
  147 | 
  148 |   await page.goto('/settings');
  149 |   await page.getByRole('button', { name: 'Delete my account…' }).click();
  150 |   await expect(page.getByLabel('Your password')).toBeFocused();
  151 |   await page.getByRole('button', { name: 'Permanently delete account' }).click();
  152 |   await expect(page.getByRole('alert').filter({ hasText: 'There is a problem' })).toBeVisible();
  153 |   await check('settings-delete-open-error');
  154 | 
  155 |   console.log(
  156 |     `axe serious/critical per page (${testInfo.project.name}): ${JSON.stringify(results)}`,
  157 |   );
  158 |   console.log(`overflow (${testInfo.project.name}): ${JSON.stringify(overflow, null, 1)}`);
  159 |   expect(
  160 |     Object.values(results).every((n) => n === 0),
  161 |     JSON.stringify(results),
> 162 |   ).toBe(true);
      |     ^ Error: {"dashboard":0,"projects-list":0,"projects-archived":0,"projects-completed":0,"project-form":0,"project-form-errors":0,"project-edit":0,"detail-draft-editor":0,"confirm-dialog":0,"confirm-dialog-error":1,"detail-baseline-current-draft-long-text":0,"detail-archived":0,"project-not-found":0,"settings-delete-open-error":0}
  163 | });
  164 | 
  165 | test('T-11 keyboard: add item with Enter, remove via keyboard, confirm via keyboard', async ({
  166 |   page,
  167 |   sessionA,
  168 | }, testInfo) => {
  169 |   const token = tokenOf(sessionA);
  170 |   const pid = await apiCreateProject(page, token, {
  171 |     title: uniq(testInfo, 'kbd'),
  172 |     client_name: 'C',
  173 |     currency: 'EUR',
  174 |   });
  175 |   await openProject(page, pid);
  176 |   const del = page.getByRole('region', { name: 'Deliverables' });
  177 |   await del.getByLabel('Add a deliverable').focus();
  178 |   await page.keyboard.type('Keyboard item');
  179 |   await page.keyboard.press('Enter');
  180 |   await expect(del.getByRole('listitem').filter({ hasText: 'Keyboard item' })).toBeVisible();
  181 |   await expect(del.getByLabel('Add a deliverable')).toBeFocused(); // focus returned to the add field
  182 |   await page.keyboard.type('Second');
  183 |   await page.keyboard.press('Enter');
  184 |   await expect(del.getByRole('listitem')).toHaveCount(2);
  185 |   // reach "Remove" for "Second" via Tab from the first item's controls
  186 |   await del.getByRole('button', { name: 'Move "Keyboard item" down' }).focus();
  187 |   await page.keyboard.press('Enter');
  188 |   await expect
  189 |     .poll(() => del.getByRole('listitem').allInnerTexts())
  190 |     .toEqual(['Second', 'Keyboard item']);
  191 |   await del.getByRole('button', { name: 'Remove "Second"' }).focus();
  192 |   await expect(del.getByRole('button', { name: 'Remove "Second"' })).toBeFocused();
  193 |   await page.keyboard.press('Enter');
  194 |   await expect(del.getByRole('listitem')).toHaveCount(1);
  195 | 
  196 |   const confirmBtn = page.getByRole('button', { name: 'Confirm original scope' });
  197 |   await confirmBtn.focus();
  198 |   await page.keyboard.press('Enter');
  199 |   const dlg = page.getByRole('group', { name: 'Confirm original scope?' });
  200 |   await expect(dlg).toBeFocused();
  201 |   await page.keyboard.press('Tab');
  202 |   await expect(dlg.getByRole('button', { name: 'Yes, confirm' })).toBeFocused();
  203 |   // visible focus indicator
  204 |   const outline = await page.evaluate(() => {
  205 |     const s = getComputedStyle(document.activeElement as Element);
  206 |     return `${s.outlineStyle} ${s.outlineWidth} ${s.boxShadow}`;
  207 |   });
  208 |   expect(outline).not.toMatch(/^none 0px none$/);
  209 |   await page.keyboard.press('Enter');
  210 |   await expect(page.getByText('Original scope confirmed and saved as the baseline.')).toBeVisible();
  211 |   await shot(page, testInfo, 'T11-keyboard-confirmed');
  212 | });
  213 | 
  214 | test('§6 realistic long text: spaced words wrap; a long URL in client contact / description', async ({
  215 |   page,
  216 |   sessionA,
  217 | }, testInfo) => {
  218 |   const token = tokenOf(sessionA);
  219 |   const words = Array.from({ length: 40 }, (_, i) => `word${i}`)
  220 |     .join(' ')
  221 |     .slice(0, 200);
  222 |   const url = `https://example.test/${'path-segment/'.repeat(20)}file.pdf`;
  223 |   const pid = await apiCreateProject(page, token, {
  224 |     title: words,
  225 |     client_name: words,
  226 |     client_contact: url,
  227 |     description: `See ${url} for the brief.`,
  228 |     currency: 'EUR',
  229 |   });
  230 |   const v1 = await apiDraftId(page, token, pid);
  231 |   await apiAddItem(page, token, v1, 'deliverable', `Deliver per ${url}`);
  232 |   const res: Record<string, unknown> = {};
  233 |   await page.goto('/projects');
  234 |   await expect(page.getByRole('main').getByRole('listitem').first()).toBeVisible();
  235 |   res.list = await noOverflow(page, true);
  236 |   await openProject(page, pid);
  237 |   res.detail = await noOverflow(page, true);
  238 |   await shot(page, testInfo, 'S6-realistic-long-text');
  239 |   console.log(`realistic long text (${testInfo.project.name}): ${JSON.stringify(res)}`);
  240 | });
  241 | 
```