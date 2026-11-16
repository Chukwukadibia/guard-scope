# Risk Register

Seeded from PRD §18 (product risks R-01–R-12), plus delivery and technical risks found in Phase 0. L/I = likelihood/impact (H/M/L).

| ID | Risk | L/I | Mitigation | Owner | Status |
|---|---|---|---|---|---|
| R-01 | Emerging direct competitors | H/M | Differentiate on scope baseline, quick capture, usability | Product owner | Open |
| R-02 | Reluctance to adopt another tool | M/H | Fast setup; validate with real freelancers (PRD §2.4) | Product owner | Open |
| R-03 | Client ignores link | M/M | Clear page, pending status, follow-up template | Team Lead | Open |
| R-04 | Poor original scope entry | M/M | Simple setup, clear exclusions and revision rules | Frontend | Open |
| R-05 | Misclassification | M/M | Freelancer decides; no automatic classification | Team Lead | Open |
| R-06 | Historical proposal altered | L/H | Immutability triggers; version-specific decisions; tests | Backend | Open |
| R-07 | Public link compromised | L/H | 256-bit token, hash, fragment transport, expiry, revocation, throttle | Backend | Open |
| R-08 | Legal overclaim | M/H | Copy review against PRD §11 wording in every feature's acceptance | Team Lead | Open |
| R-09 | Free-tier limits change or project pausing | M/M | VERIFY limits; monitor; keep the stack portable (plain Postgres + static SPA) | Team Lead | Open |
| R-10 | Low recurring usage | M/H | Validate retention; no engagement-bait features | Product owner | Open |
| R-11 | Currency confusion | M/M | Per-record currency; group-by-currency totals only | Backend | Open |
| R-12 | Scope creep in the build | M/H | Out-of-scope list; one feature at a time; human gates | Team Lead | Open |
| R-13 | No access to target GitHub repo (ISS-001) | H/H | Work staged locally; supervisor to grant access. **Staged work is lost if the container is reclaimed before push** | Product owner | **Active** |
| R-14 | Local Supabase stack needs Docker; the daemon is unavailable in the AI environment | H/H | **Mitigated:** `guardscope-dev` cloud project approved (HA-003) and used for DB/RLS/E2E tests | Team Lead | Mitigated |
| R-15 | 3-day target pressure vs. gates | H/M | PRD §13.1: extend schedule rather than skip tests | Team Lead | Open |
| R-16 | **Confirmed:** Supabase's default sender only emails org team members, at low hourly limits. Real users cannot confirm accounts until custom SMTP exists | H/H | OD-13 custom SMTP before any real-user beta; dev tests use SQL-confirmed fixtures | Product owner | **Active** |
