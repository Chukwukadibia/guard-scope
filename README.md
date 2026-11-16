# GuardScope

*Know what's included. Charge for what's extra.* GuardScope is a lightweight scope and change-approval workspace for solo freelancers. GuardScope is a working name and is not brand-cleared.

**Status:** Phase 0 (foundation & governance) is complete and awaiting approval. No product features are implemented yet. See [PROJECT_STATUS.md](PROJECT_STATUS.md).

## Start here
- [MASTER_PRD.md](MASTER_PRD.md): product requirements (authoritative)
- [AI_TEAM_OPERATING_PROTOCOL.md](AI_TEAM_OPERATING_PROTOCOL.md): how work is delivered and approved
- [ARCHITECTURE.md](ARCHITECTURE.md): technical design (draft)
- [HUMAN_APPROVAL_LOG.md](HUMAN_APPROVAL_LOG.md): what has been approved

## Local development
Requirements: Node 20+ and npm. Docker is needed for the local Supabase stack (from Phase 1).

```bash
npm ci
cp .env.example .env.local   # fill in public values only
npm run dev
```

| Script | Purpose |
|---|---|
| `npm run check` | format check, lint, typecheck, unit tests and build (same as CI) |
| `npm run lint` / `npm run format` | ESLint / Prettier |
| `npm run typecheck` | TypeScript, no emit |
| `npm test` | Vitest unit tests |
| `npm run test:e2e` | Playwright (set `PW_CHROMIUM_PATH` to reuse a preinstalled Chromium) |
| `npm run build` | Production build to `dist/` |
| `npx supabase start` / `npx supabase db reset` / `npx supabase test db` | Local DB, replay migrations, run pgTAP tests (Phase 1+) |

Never commit `.env*` files (except `.env.example`) or any service-role/secret key.
