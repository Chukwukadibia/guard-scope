// Phase 5 Tester, chunk A: live API/token security checks against guardscope-dev (anon key + real user logins).
// Run: set -a; . ./.env.local; . ./.env.test.local; set +a
//      NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt /opt/node22/bin/node tests/api/p5-chunkA-live.mjs <scenario>
// Scenarios: surface | concurrency | races | expiry | throttle | spoof
// Raw approval tokens are kept in memory only and never printed or written. Output goes to docs/testing/phase5/.
import { writeFileSync, mkdirSync } from 'node:fs';

const URL_ = process.env.VITE_SUPABASE_URL;
const KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const OUT = 'docs/testing/phase5';
mkdirSync(OUT, { recursive: true });
const scenario = process.argv[2];
const log = [];
const say = (...a) => { const s = a.join(' '); log.push(s); console.log(s); };
const results = {};

async function call(method, path, { token, body, headers = {}, raw } = {}) {
  const h = { apikey: KEY, ...headers };
  if (token) h.Authorization = `Bearer ${token}`;
  let payload;
  if (raw !== undefined) payload = raw; else if (body !== undefined) { payload = JSON.stringify(body); h['Content-Type'] ??= 'application/json'; }
  if (method !== 'GET' && method !== 'HEAD' && !h.Prefer) h.Prefer = 'return=representation';
  const t0 = performance.now();
  const res = await fetch(`${URL_}${path}`, { method, headers: h, body: payload });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = undefined; }
  return { status: res.status, ms: Math.round(performance.now() - t0), text, json, headers: res.headers };
}
async function login(email, password) {
  const r = await call('POST', '/auth/v1/token?grant_type=password', { body: { email, password } });
  if (r.status !== 200) throw new Error('login failed ' + r.status);
  return { token: r.json.access_token, id: r.json.user.id };
}
const rpc = (name, body, token, headers) => call('POST', `/rest/v1/rpc/${name}`, { token, body, headers });

async function mkPending(A, label) {
  const proj = await call('POST', '/rest/v1/projects', { token: A.token, body: { title: `P5T ${label}`, client_name: 'P5T Client', currency: 'EUR' } });
  const projectId = proj.json[0].id;
  const rq = await call('POST', '/rest/v1/requests', { token: A.token, body: { project_id: projectId, title: `P5T req ${label}`, description: 'live test', internal_notes: 'P5T-PRIVATE-NOTE' } });
  const requestId = rq.json[0].id;
  const c = await rpc('classify_request', { p_request_id: requestId, p_classification: 'additional' }, A.token);
  if (c.status !== 200) throw new Error('classify ' + c.status + c.text);
  const co = await rpc('create_change_order', { p_request_id: requestId }, A.token);
  const coId = co.json;
  const vs = await call('GET', `/rest/v1/change_order_versions?change_order_id=eq.${coId}&select=id,version_no`, { token: A.token });
  const v1 = vs.json[0].id;
  await call('PATCH', `/rest/v1/change_order_versions?id=eq.${v1}`, { token: A.token, body: { description: 'Live test body', price_impact: 123.45 } });
  const s = await rpc('send_change_order_version', { p_version_id: v1 }, A.token);
  if (s.status !== 200) throw new Error('send ' + s.status + s.text);
  const iss = await rpc('issue_approval_link', { p_version_id: v1 }, A.token);
  if (iss.status !== 200) throw new Error('issue ' + iss.status + iss.text);
  return { projectId, requestId, coId, v1, tok: iss.json.token, expires_at: iss.json.expires_at };
}
const uuid = () => crypto.randomUUID();
const randTok = () => Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');
const pub = (tok) => rpc('get_public_proposal', { p_token: tok });
const dec = (tok, d, c, k, headers) => rpc('submit_public_decision', { p_token: tok, p_decision: d, p_comment: c ?? null, p_idempotency_key: k ?? uuid() }, undefined, headers);
const save = (name) => { writeFileSync(`${OUT}/${name}`, log.join('\n') + '\n'); writeFileSync(`${OUT}/${name.replace(/\.txt$/, '.json')}`, JSON.stringify(results, null, 2)); };
const mask = (s, tok) => (tok ? s.split(tok).join('<RAW-TOKEN>') : s);

const A = await login(process.env.TEST_USER_A_EMAIL, process.env.TEST_USER_A_PASSWORD);
const B = await login(process.env.TEST_USER_B_EMAIL, process.env.TEST_USER_B_PASSWORD);
say(`scenario=${scenario} started ${new Date().toISOString()}`);

if (scenario === 'surface') {
  const f = await mkPending(A, 'surface');
  results.fixture = { projectId: f.projectId, v1: f.v1, coId: f.coId };
  say('issue via REST RPC as owner: expires_at', f.expires_at, 'token length', f.tok.length, 'base64url', /^[A-Za-z0-9_-]{43}$/.test(f.tok));
  const days = (new Date(f.expires_at) - Date.now()) / 86400000; say('expiry days from now', days.toFixed(3)); results.expiryDays = days;
  // 1. raw token in REST-readable surfaces (owner JWT)
  const surfaces = {
    approval_links_cols: `/rest/v1/approval_links?select=id,version_id,expires_at,revoked_at,created_at`,
    approval_links_star: `/rest/v1/approval_links?select=*`,
    approval_links_hash: `/rest/v1/approval_links?select=token_hash`,
    decisions_star: `/rest/v1/client_decisions?select=*`,
    decisions_key: `/rest/v1/client_decisions?select=idempotency_key`,
    activity_events: `/rest/v1/activity_events?select=*&project_id=eq.${f.projectId}`,
    versions: `/rest/v1/change_order_versions?select=*&change_order_id=eq.${f.coId}`,
    projects: `/rest/v1/projects?select=*&id=eq.${f.projectId}`,
  };
  results.ownerReads = {};
  for (const [k, p] of Object.entries(surfaces)) {
    const r = await call('GET', p, { token: A.token });
    const leaked = r.text.includes(f.tok);
    results.ownerReads[k] = { status: r.status, leaked, code: r.json?.code, rows: Array.isArray(r.json) ? r.json.length : null };
    say(`owner GET ${k}: ${r.status} code=${r.json?.code ?? '-'} rows=${Array.isArray(r.json) ? r.json.length : '-'} rawTokenInBody=${leaked}`);
  }
  // events: list link event summaries
  const ev = await call('GET', `/rest/v1/activity_events?select=event_type,summary,metadata&project_id=eq.${f.projectId}&order=created_at`, { token: A.token });
  say('owner-visible events:', JSON.stringify(ev.json.map((e) => e.event_type)));
  // headers of issue response
  const reissue = await rpc('issue_approval_link', { p_version_id: f.v1 }, A.token);
  const hdrLeak = [...reissue.headers].some(([, v]) => v.includes(reissue.json.token));
  say('raw token in any response header of issue RPC:', hdrLeak);
  results.headerLeak = hdrLeak;
  f.tok = reissue.json.token;
  say('old link after reissue ->', JSON.stringify((await pub(f.tok)).json?.state));
  // errors must not echo token
  const errs = [];
  errs.push(await rpc('issue_approval_link', { p_version_id: 'not-a-uuid' }, A.token));
  errs.push(await rpc('issue_approval_link', { p_version_id: f.v1, extra: f.tok }, A.token));
  errs.push(await call('POST', '/rest/v1/rpc/get_public_proposal', { body: { p_token: f.tok, bogus: 1 } }));
  errs.push(await call('POST', '/rest/v1/rpc/submit_public_decision', { body: { p_token: f.tok, p_decision: 'x' } }));
  errs.push(await call('POST', '/rest/v1/rpc/submit_public_decision', { body: { p_token: f.tok, p_decision: 'approved', p_comment: null, p_idempotency_key: 'bad-uuid' } }));
  errs.push(await call('POST', '/rest/v1/approval_links', { token: A.token, body: { version_id: f.v1, token_hash: '\\x00', expires_at: new Date().toISOString() } }));
  say('error responses leak raw token:', errs.map((e) => `${e.status}:${e.text.includes(f.tok)}`).join(' '));
  say('error codes:', errs.map((e) => e.json?.code ?? e.status).join(' '));
  results.errorLeaks = errs.map((e) => ({ status: e.status, code: e.json?.code, leaked: e.text.includes(f.tok) }));
  // 2. anon GET on RPC
  const g1 = await call('GET', `/rest/v1/rpc/get_public_proposal?p_token=${encodeURIComponent(randTok())}`);
  say('anon GET rpc/get_public_proposal (random token):', g1.status, g1.json?.code ?? g1.text.slice(0, 160));
  const g2 = await call('GET', `/rest/v1/rpc/submit_public_decision?p_token=${randTok()}&p_decision=approved&p_comment=&p_idempotency_key=${uuid()}`);
  say('anon GET rpc/submit_public_decision:', g2.status, g2.json?.code ?? g2.text.slice(0, 160));
  const g3 = await call('GET', `/rest/v1/rpc/issue_approval_link?p_version_id=${f.v1}`);
  say('anon GET rpc/issue_approval_link:', g3.status, g3.json?.code ?? g3.text.slice(0, 120));
  results.anonGet = { get_public_proposal: g1.status, submit: g2.status, issue: g3.status };
  // GET with the real token must not decide or change anything
  const gValid = await call('GET', `/rest/v1/rpc/submit_public_decision?p_token=${f.tok}&p_decision=approved&p_comment=&p_idempotency_key=${uuid()}`);
  say('anon GET submit with a VALID token ->', gValid.status, 'state after:', (await pub(f.tok)).json?.state);
  results.getValidStatus = gValid.status;
  // 3. direct access, anon and B
  results.directAccess = {};
  const tables = ['approval_links', 'client_decisions', 'public_link_attempts', 'public_link_config', 'change_order_versions', 'change_orders', 'activity_events', 'requests', 'projects'];
  for (const [who, tok] of [['anon', undefined], ['B', B.token]]) {
    for (const t of tables) {
      const r = await call('GET', `/rest/v1/${t}?select=*&limit=5`, { token: tok });
      const rows = Array.isArray(r.json) ? r.json.length : null;
      results.directAccess[`${who}.${t}`] = { status: r.status, code: r.json?.code, rows };
      say(`${who} GET ${t}: ${r.status} code=${r.json?.code ?? '-'} rows=${rows ?? '-'}`);
    }
    for (const t of ['approval_links', 'client_decisions', 'public_link_attempts', 'public_link_config', 'change_order_versions']) {
      const w = await call('POST', `/rest/v1/${t}`, { token: tok, body: { version_id: f.v1 } });
      const u = await call('PATCH', `/rest/v1/${t}?version_id=eq.${f.v1}`, { token: tok, body: { revoked_at: null } });
      const d = await call('DELETE', `/rest/v1/${t}?version_id=eq.${f.v1}`, { token: tok });
      results.directAccess[`${who}.write.${t}`] = { post: w.status, patch: u.status, del: d.status, codes: [w.json?.code, u.json?.code, d.json?.code] };
      say(`${who} POST/PATCH/DELETE ${t}: ${w.status}/${u.status}/${d.status} codes ${[w.json?.code, u.json?.code, d.json?.code].join(',')}`);
    }
  }
  // owner (A) cannot write decisions
  const aw = await call('POST', '/rest/v1/client_decisions', { token: A.token, body: { version_id: f.v1, decision: 'approved' } });
  say('owner A POST client_decisions:', aw.status, aw.json?.code);
  results.ownerWriteDecision = aw.status;
  // B cannot issue/revoke on A's version; B sees nothing
  const bi = await rpc('issue_approval_link', { p_version_id: f.v1 }, B.token);
  const br = await rpc('revoke_approval_link', { p_version_id: f.v1 }, B.token);
  say('B issue on A version:', bi.status, bi.json?.message, '| B revoke:', br.status, br.json?.message);
  say('A link still valid after B attempts ->', (await pub(f.tok)).json?.state);
  results.bCross = { issue: bi.json?.message, revoke: br.json?.message };
  // anon RPC grants
  for (const fn of ['issue_approval_link', 'revoke_approval_link', '_throttle_key', '_throttle_blocked', '_link_state', 'classify_request', 'send_change_order_version', 'delete_my_account']) {
    const r = await rpc(fn, { p_version_id: f.v1, p_request_id: f.v1, p_classification: 'x', p_p_key: '\\x00' });
    say(`anon POST rpc/${fn}: ${r.status} ${r.json?.code ?? ''} ${(r.json?.message ?? '').slice(0, 70)}`);
    results.directAccess[`anon.rpc.${fn}`] = { status: r.status, code: r.json?.code };
  }
  say('final state of fixture link:', (await pub(f.tok)).json?.state);
  save('chunkA-live-surface.txt');
}

if (scenario === 'edge1' || scenario === 'edge2' || scenario === 'edge3') {
  const f = await mkPending(A, scenario);
  results.fixture = { v1: f.v1, projectId: f.projectId };
  const edge = {
    empty: '', short: 'abc', long44: 'a'.repeat(44), pad: 'a'.repeat(42) + '=', plus: 'a'.repeat(42) + '+', slash: 'a'.repeat(42) + '/',
    space_lead: ' ' + f.tok, space_trail: f.tok + ' ', nl: f.tok + '\n', tab: '\t' + f.tok, nbsp: ' ' + f.tok.slice(1), zwsp: f.tok + '​',
    cyrillic: 'a'.repeat(42) + 'а', emoji: 'a'.repeat(42) + '\u{1F600}', upper: f.tok.toUpperCase(), lower: f.tok.toLowerCase(),
    sqli: "'; drop table public.projects;--", percent: '%'.repeat(43), nul: 'a'.repeat(42) + '\u0000',
  };
  results.edge = {};
  const keys = Object.keys(edge); const half = Math.ceil(keys.length / 2);
  const pick = scenario === 'edge1' ? keys.slice(0, half) : scenario === 'edge2' ? keys.slice(half) : [];
  for (const [k, v] of Object.entries(edge).filter(([k]) => pick.includes(k))) {
    const r = await pub(v);
    const sameAsValid = v === f.tok;
    results.edge[k] = { status: r.status, state: r.json?.state ?? r.json?.code, ms: r.ms };
    say(`edge ${k}: http ${r.status} state=${r.json?.state ?? '-'} code=${r.json?.code ?? '-'} ${r.ms}ms${sameAsValid ? ' (SAME AS VALID)' : ''}`);
  }
  await call('GET', '/rest/v1/'); // noop
  // 1 MB and ~5 MB tokens, malformed bodies (edge3 only)
  if (scenario === 'edge3') {
  for (const [label, n] of [['1MB', 1 << 20], ['5MB', 5 << 20]]) {
    const r = await pub('a'.repeat(n));
    say(`edge ${label} token: http ${r.status} state=${r.json?.state ?? '-'} code=${r.json?.code ?? '-'} ${r.ms}ms`);
    results.edge[label] = { status: r.status, state: r.json?.state ?? r.json?.code, ms: r.ms };
  }
  const rb = await dec(f.tok, 'approved', 'y'.repeat(1 << 20));
  say(`1MB comment submit: http ${rb.status} ${rb.text.slice(0, 80)} ${rb.ms}ms`);
  // malformed bodies / content types
  const m = {};
  m.badjson = await call('POST', '/rest/v1/rpc/get_public_proposal', { raw: '{not json', headers: { 'Content-Type': 'application/json' } });
  m.array = await call('POST', '/rest/v1/rpc/get_public_proposal', { raw: '[1,2]', headers: { 'Content-Type': 'application/json' } });
  m.missing = await call('POST', '/rest/v1/rpc/get_public_proposal', { body: {} });
  m.numeric = await call('POST', '/rest/v1/rpc/get_public_proposal', { body: { p_token: 12345 } });
  m.object = await call('POST', '/rest/v1/rpc/get_public_proposal', { body: { p_token: { a: 1 } } });
  m.textplain = await call('POST', '/rest/v1/rpc/get_public_proposal', { raw: JSON.stringify({ p_token: f.tok }), headers: { 'Content-Type': 'text/plain' } });
  m.nulbody = await call('POST', '/rest/v1/rpc/get_public_proposal', { raw: '{"p_token":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\\u0000"}', headers: { 'Content-Type': 'application/json' } });
  for (const [k, r] of Object.entries(m)) say(`malformed ${k}: http ${r.status} code=${r.json?.code ?? '-'} state=${r.json?.state ?? '-'} msg=${mask((r.json?.message ?? '').slice(0, 80), f.tok)}`);
  results.malformed = Object.fromEntries(Object.entries(m).map(([k, r]) => [k, { status: r.status, code: r.json?.code, state: r.json?.state }]));
  say('any 5xx in malformed set:', Object.values(m).some((r) => r.status >= 500));
  }
  say('final state of fixture link:', (await pub(f.tok)).json?.state);
  save(`chunkA-live-${scenario}.txt`);
}

if (scenario === 'grants') {
  const f = await mkPending(A, 'grants');
  results.fixture = { v1: f.v1, projectId: f.projectId, coId: f.coId, requestId: f.requestId };
  const probes = [
    ['issue_approval_link', { p_version_id: f.v1 }], ['revoke_approval_link', { p_version_id: f.v1 }],
    ['classify_request', { p_request_id: f.requestId, p_classification: 'included' }], ['create_change_order', { p_request_id: f.requestId }],
    ['send_change_order_version', { p_version_id: f.v1 }], ['cancel_change_order_version', { p_version_id: f.v1 }],
    ['new_change_order_version', { p_change_order_id: f.coId }], ['discard_change_order_draft', { p_version_id: f.v1 }],
    ['confirm_scope', { p_version_id: f.v1 }], ['delete_my_account', {}],
    ['_throttle_key', {}], ['_throttle_limits', {}], ['_throttle_blocked', { p_key: '\\x00' }], ['_throttle_record_failure', { p_key: '\\x00' }],
    ['_link_state', { p_status: 'pending', p_revoked: null, p_expires: new Date().toISOString(), p_version_no: 1, p_max_no: 1 }],
    ['_lock_change_order', { p_change_order_id: f.coId, p_require_active: true }], ['approval_links_guard', {}], ['client_decisions_guard', {}],
  ];
  results.anonRpc = {}; results.authRpcInternal = {};
  for (const [fn, body] of probes) {
    const r = await rpc(fn, body);
    results.anonRpc[fn] = { status: r.status, code: r.json?.code };
    say(`anon  rpc/${fn}: ${r.status} ${r.json?.code ?? ''} ${(r.json?.message ?? '').slice(0, 60)}`);
  }
  for (const fn of ['_throttle_key', '_throttle_limits', '_throttle_blocked', '_throttle_record_failure', '_link_state', '_lock_change_order', 'approval_links_guard', 'client_decisions_guard']) {
    const body = probes.find((x) => x[0] === fn)[1];
    const r = await rpc(fn, body, B.token);
    results.authRpcInternal[fn] = { status: r.status, code: r.json?.code };
    say(`authd rpc/${fn}: ${r.status} ${r.json?.code ?? ''}`);
  }
  results.writes = {};
  const wr = [
    ['approval_links', { version_id: f.v1, token_hash: '\\x' + '00'.repeat(32), expires_at: new Date(Date.now() + 1e9).toISOString() }, 'id=not.is.null', { revoked_at: null }],
    ['client_decisions', { version_id: f.v1, link_id: uuid(), decision: 'approved', idempotency_key: uuid() }, 'id=not.is.null', { decision: 'declined' }],
    ['public_link_attempts', { source_key: '\\x01', window_start: new Date().toISOString(), failures: 0 }, 'failures=gte.0', { failures: 0 }],
    ['public_link_config', { salt: '\\x01' }, 'singleton=eq.true', { salt: '\\x02' }],
    ['change_order_versions', { change_order_id: f.coId, version_no: 99, title: 'x', currency: 'EUR', status: 'approved' }, `id=eq.${f.v1}`, { status: 'approved' }],
  ];
  for (const [who, tok] of [['anon', undefined], ['A-owner', A.token], ['B', B.token]]) {
    for (const [t, ins, flt, upd] of wr) {
      const w = await call('POST', `/rest/v1/${t}`, { token: tok, body: ins });
      const u = await call('PATCH', `/rest/v1/${t}?${flt}`, { token: tok, body: upd });
      const d = await call('DELETE', `/rest/v1/${t}?${flt}`, { token: tok });
      results.writes[`${who}.${t}`] = { post: [w.status, w.json?.code], patch: [u.status, u.json?.code], del: [d.status, d.json?.code] };
      say(`${who} ${t}: POST ${w.status}/${w.json?.code ?? '-'} PATCH ${u.status}/${u.json?.code ?? '-'} DELETE ${d.status}/${d.json?.code ?? '-'}`);
    }
  }
  say('fixture link state after all attempts:', (await pub(f.tok)).json?.state);
  save('chunkA-live-grants.txt');
}

if (scenario === 'concurrency') {
  const ROUNDS = 10, N = 24;
  results.rounds = [];
  for (let r = 1; r <= ROUNDS; r++) {
    const f = await mkPending(A, `conc r${r}`);
    const keys = Array.from({ length: 6 }, uuid); // reused keys => already_recorded candidates
    const kinds = ['approved', 'declined', 'clarification_requested'];
    const jobs = Array.from({ length: N }, (_, i) => {
      const key = i % 2 === 0 ? keys[i % 6] : uuid();
      return { i, key, decision: kinds[i % 3] };
    });
    const resp = await Promise.all(jobs.map((j) => dec(f.tok, j.decision, `c${j.i}`, j.key)));
    const out = resp.map((x, i) => ({ i, key: jobs[i].key, decision: jobs[i].decision, http: x.status, res: x.json?.result, err: x.json?.error, od: x.json?.decision, code: x.json?.code }));
    const recorded = out.filter((o) => o.res === 'recorded');
    const winner = recorded[0];
    const bad = out.filter((o) => o.http >= 500 || (o.http !== 200) || (o.res === 'already_recorded' && (!winner || o.key !== winner.key)) || (o.err && o.err !== 'decided'));
    const summary = { round: r, v1: f.v1, recorded: recorded.length, already: out.filter((o) => o.res === 'already_recorded').length, decided: out.filter((o) => o.err === 'decided').length, other: bad.length, winnerDecision: winner?.decision, winnerKeyIdx: winner ? keys.indexOf(winner.key) : null, maxMs: Math.max(...resp.map((x) => x.ms)) };
    // already_recorded must return the WINNER's decision, not the caller's
    summary.alreadyReturnsOriginal = out.filter((o) => o.res === 'already_recorded').every((o) => o.od === winner?.decision);
    say(JSON.stringify(summary));
    results.rounds.push({ ...summary, projectId: f.projectId, coId: f.coId });
  }
  say('rounds with exactly one recorded:', results.rounds.filter((x) => x.recorded === 1).length, '/', ROUNDS);
  say('rounds with any 5xx / unexpected response:', results.rounds.filter((x) => x.other > 0).length);
  save('chunkA-live-concurrency.txt');
}

if (scenario === 'races') {
  results.rounds = [];
  const kinds = ['approved', 'declined', 'clarification_requested'];
  for (const mode of ['cancel', 'supersede', 'revoke']) {
    for (let r = 1; r <= 10; r++) {
      const f = await mkPending(A, `race ${mode} ${r}`);
      let ownerOp;
      if (mode === 'cancel') ownerOp = () => rpc('cancel_change_order_version', { p_version_id: f.v1 }, A.token);
      if (mode === 'revoke') ownerOp = () => rpc('revoke_approval_link', { p_version_id: f.v1 }, A.token);
      let v2 = null;
      if (mode === 'supersede') {
        // chain: new draft -> fill -> send, launched concurrently with the decision burst (the draft step itself is F-1)
        ownerOp = async () => {
          const n = await rpc('new_change_order_version', { p_change_order_id: f.coId }, A.token);
          v2 = n.json;
          if (!v2 || typeof v2 !== 'string') return n;
          await call('PATCH', `/rest/v1/change_order_versions?id=eq.${v2}`, { token: A.token, body: { description: 'v2 body', price_impact: 200 } });
          return rpc('send_change_order_version', { p_version_id: v2 }, A.token);
        };
      }
      const jobs = [];
      const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
      const offset = Math.floor(Math.random() * 160);
      const ownerFirst = r % 2 === 1; // odd rounds: owner action starts first and the burst is delayed by `offset`
      for (let i = 0; i < 24; i++) jobs.push((async () => { await sleep((ownerFirst ? offset : 0) + i * 8); return dec(f.tok, kinds[i % 3], `race${i}`, uuid()); })());
      const op = (async () => { if (!ownerFirst) await sleep(offset); return ownerOp(); })();
      // stagger so the owner op lands in the middle of the burst
      const all = await Promise.all([...jobs, op]);
      const opRes = all[all.length - 1];
      const decs = all.slice(0, -1);
      const rec = decs.filter((x) => x.json?.result === 'recorded').length;
      const s5 = all.filter((x) => x.status >= 500).length;
      const row = { mode, r, offset, ownerFirst, v1: f.v1, v2: v2 ?? null, coId: f.coId, recorded: rec, ownerHttp: opRes.status, ownerMsg: opRes.json?.message ?? (opRes.json === true ? 'true' : (opRes.json?.status ?? 'ok')), errs: [...new Set(decs.map((x) => x.json?.error).filter(Boolean))], fivexx: s5, deadlock: all.some((x) => /deadlock/i.test(x.text)) };
      say(JSON.stringify(row));
      results.rounds.push(row);
    }
  }
  say('total 5xx:', results.rounds.reduce((a, x) => a + x.fivexx, 0), 'deadlocks:', results.rounds.filter((x) => x.deadlock).length);
  save('chunkA-live-races.txt');
}

if (scenario === 'expiry') {
  const f = await mkPending(A, 'expiry');
  results.fixture = { v1: f.v1, projectId: f.projectId };
  say('fixture ready; waiting for SQL-side expiry change (harness sets expires_at = now()+15s), then call "expiry-check"');
  say('state now', (await pub(f.tok)).json?.state);
  // The raw token is needed again after the SQL step: keep it only in this process.
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  // poll until state != valid (SQL step runs in parallel), max 4 minutes
  const t0 = Date.now(); let st = 'valid'; let sawValidAfterShortExpiry = false;
  while (Date.now() - t0 < 240000) { await wait(3000); st = (await pub(f.tok)).json?.state; if (st !== 'valid') break; sawValidAfterShortExpiry = true; }
  say('state turned', st, 'after', Math.round((Date.now() - t0) / 1000), 's');
  const d = await dec(f.tok, 'approved', 'after expiry', uuid());
  say('decision after expiry ->', d.status, JSON.stringify(d.json));
  results.expiry = { finalState: st, decision: d.json };
  const g = await pub(f.tok);
  say('read after expiry ->', JSON.stringify(g.json));
  results.readAfter = g.json;
  save('chunkA-live-expiry.txt');
}

if (scenario === 'throttle') {
  // The egress pool rotates source IPs, so measure per observed outcome and reconcile with the DB / edge logs afterwards.
  const f = await mkPending(A, 'throttle');
  results.fixture = { v1: f.v1, projectId: f.projectId };
  const seq = [];
  for (let i = 1; i <= 120; i++) seq.push((await pub(randTok())).json?.state);
  const firstLimited = seq.indexOf('rate_limited') + 1;
  say('120 random well-formed tokens: invalid =', seq.filter((s) => s === 'invalid').length, 'rate_limited =', seq.filter((s) => s === 'rate_limited').length, 'first rate_limited at attempt', firstLimited);
  results.randomTokens = { invalid: seq.filter((s) => s === 'invalid').length, limited: seq.filter((s) => s === 'rate_limited').length, firstLimited };
  const tally = {}; const dtally = {};
  for (let i = 0; i < 16; i++) { const st = (await pub(f.tok)).json?.state; tally[st] = (tally[st] ?? 0) + 1; }
  for (let i = 0; i < 6; i++) { const d = await dec(f.tok, 'approved', null, uuid()); const k = d.json?.error ?? d.json?.result; dtally[k] = (dtally[k] ?? 0) + 1; if (d.json?.result === 'recorded') break; }
  say('VALID token reads right after the burst (sources rotate):', JSON.stringify(tally));
  say('decision attempts right after the burst:', JSON.stringify(dtally));
  results.validAfterBurst = tally; results.decisionAfterBurst = dtally;
  say('now (UTC)', new Date().toISOString());
  save('chunkA-live-throttle.txt');
  const nowMs = Date.now(); const bin = 600000; const next = Math.ceil((nowMs + 1) / bin) * bin;
  say('waiting until window boundary', new Date(next).toISOString(), 'plus 3s');
  await new Promise((r) => setTimeout(r, next - nowMs + 3000));
  const t2 = {};
  for (let i = 0; i < 16; i++) { const st = (await pub(f.tok)).json?.state; t2[st] = (t2[st] ?? 0) + 1; }
  say('after rollover, valid token reads:', JSON.stringify(t2));
  const bad = await pub(randTok()); say('a fresh failure after rollover is processed ->', bad.json?.state);
  results.afterWindow = t2;
  save('chunkA-live-throttle.txt');
}

if (scenario === 'spoof') {
  // Send 3 invalid lookups per header variant, each with a DISTINCT marker value; the SQL harness then checks which
  // salted keys exist in public_link_attempts (a spoofed value producing its own key row means the header was trusted).
  const variants = {
    'xff-single': { 'X-Forwarded-For': '203.0.113.7' },
    'xff-two': { 'X-Forwarded-For': '198.51.100.9, 203.0.113.8' },
    'cf-spoof': { 'CF-Connecting-IP': '203.0.113.50' },
    'xri-spoof': { 'X-Real-IP': '203.0.113.51' },
    'tci-spoof': { 'True-Client-IP': '203.0.113.52' },
    'fwd-spoof': { Forwarded: 'for=203.0.113.53' },
    'xff-trailing-comma': { 'X-Forwarded-For': '203.0.113.54,' },
    'xff-and-cf': { 'X-Forwarded-For': '203.0.113.55, 203.0.113.56', 'CF-Connecting-IP': '203.0.113.57' },
    'none': {},
  };
  results.spoof = {};
  const marks = {};
  for (const [k, h] of Object.entries(variants)) {
    const states = [];
    for (let i = 0; i < 3; i++) { const r = await rpc('get_public_proposal', { p_token: randTok() }, undefined, h); states.push(r.json?.state); }
    results.spoof[k] = states; say(`${k}: ${states.join(',')}`);
  }
  say('candidate values to check in SQL: 203.0.113.7 .8 .9(198.51.100.9) .50 .51 .52 .53 .54 .55 .56 .57');
  save('chunkA-live-spoof.txt');
}
say('done', new Date().toISOString());

