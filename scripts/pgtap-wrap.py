"""Wrap a pgTAP test file so a single remote SQL call returns all TAP lines.

Used when `supabase test db` cannot run (no Docker). Output SQL: same statements,
with each pgTAP assertion's output captured into a temp table, then returned
before the final ROLLBACK. Usage: python3 scripts/pgtap-wrap.py tests/db/x.test.sql
"""
import re
import sys

src = open(sys.argv[1]).read()
out = []
for line in src.splitlines():
    s = line.strip()
    if s == 'begin;':
        out += [line, 'create temp table _tap (r text);', 'grant insert on _tap to anon, authenticated;']
    elif s == 'rollback;':
        out += ["select string_agg(r, E'\\n') as tap from _tap;", line]
    elif s.startswith('select * from finish()'):
        out.append('insert into _tap select * from finish();')
    elif re.match(r'select (plan|is|ok|isnt|lives_ok|throws_ok|results_eq)\(', s):
        out.append('insert into _tap ' + s)
    else:
        out.append(line)
print('\n'.join(out))
