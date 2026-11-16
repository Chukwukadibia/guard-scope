// AC-7 / T-10: fail if the production bundle contains privileged credentials.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const patterns = [
  /sb_secret_[A-Za-z0-9_-]{16,}/, // new-style secret key
  /postgres(ql)?:\/\/[^\s"'`]+:[^\s"'`]+@/, // DB URL with password
];
const jwt = /eyJ[A-Za-z0-9_-]{10,}\.(eyJ[A-Za-z0-9_-]{10,})\.[A-Za-z0-9_-]{10,}/g;

function* files(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* files(p);
    else if (/\.(js|html|css|json|webmanifest)$/.test(e.name)) yield p;
  }
}

let bad = 0;
for (const f of files('dist')) {
  const text = readFileSync(f, 'utf8');
  for (const re of patterns)
    if (re.test(text)) (bad++, console.error(`Secret pattern ${re} in ${f}`));
  for (const m of text.matchAll(jwt)) {
    const payload = JSON.parse(Buffer.from(m[1], 'base64url').toString('utf8') || '{}');
    if (payload.role === 'service_role') (bad++, console.error(`service_role JWT in ${f}`));
  }
}
if (bad) process.exit(1);
console.log('check:secrets: no privileged credentials in dist/');
