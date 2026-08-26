from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

now = datetime.now(ZoneInfo('Australia/Perth')).isoformat(timespec='seconds')
plan_path = Path('documentation/in-app-user-guide-project-plan.md')
journal_path = Path('documentation/in-app-user-guide-controller-journal.md')
audit_path = Path('documentation/in-app-user-guide-audits/APPGUIDE-001.md')

plan = plan_path.read_text()
journal = journal_path.read_text()
audit = audit_path.read_text()

# Refuse to decide through state drift.
assert '| APPGUIDE-001 | **IN REVIEW** | Render canonical guide at `/help` |' in plan
assert '| APPGUIDE-002 | **PLANNED** | Navigation and production completion |' in plan
assert 'task_id: APPGUIDE-001\nhandoff_owner: AUDITOR\nhandoff_status: READY_FOR_AUDIT\ncurrent_status: IN REVIEW' in plan
assert 'active_task: APPGUIDE-001\nactive_task_status: IN REVIEW\nhandoff_owner: AUDITOR\nhandoff_status: READY_FOR_AUDIT' in journal
assert '**Producer state:** READY_FOR_AUDIT' in audit

# Append independent decision. First run failed only because the Auditor's own route-map wording assertion was too narrow;
# the corrected independent run passed without any functional implementation changes.
audit += f'''\n\n## Independent Auditor decision\n\n**Decision:** PASS  \n**Audited at:** {now} (Australia/Perth)  \n**Functional implementation reviewed:** `7f0b31f939e49b4c6b9f40bcb068aba30766d92e^..1a336ee074a2d7177984c425ddc3ca0c948d4732`  \n**Producer evidence reviewed:** `3448ae0aff8ffac6873d41b686645802b9b6e06b`  \n**Independent QA:** GitHub Actions run `32930590164`, job `98061927379` — PASS  \n**Data or schema effects:** none\n\n### Independent checks performed\n\n- Confirmed the functional range contains exactly eight implementation commits changing only the eight files declared in the Producer handoff.\n- Confirmed `components/AppNav.tsx` remains untouched; Help navigation is correctly reserved for APPGUIDE-002.\n- Independently confirmed `app/help/page.tsx` reads the canonical loader and contains no copied guide prose.\n- Confirmed `lib/user-guide.ts` reads `documentation/user-guide.md`, safely rewrites relative documentation links to GitHub and rewrites only canonical guide screenshot paths to generated public assets.\n- Confirmed raw arbitrary HTML rendering is disabled, GitHub-flavoured Markdown tables are enabled and stable heading IDs are generated.\n- Confirmed Help-specific styling uses existing `--theme-*` variables, has visible `:focus-visible` treatment, responsive images and contained table scrolling with no raw colour literals.\n- Independently resolved all 22 relative canonical guide links in the repository.\n- Rebuilt from a fresh checkout: `npm test` 9/9 PASS, palette compliance PASS and `npm run build` PASS with `/help` statically prerendered.\n- Confirmed the prebuild published exactly six screenshot assets and verified each generated file is byte-identical to its canonical `documentation/images/user-guide/` source.\n- Independently started the production-mode app and verified `/help` renders the canonical title/source marker, real tables, all six loaded images with meaningful alt text, stable heading anchors and rewritten GitHub documentation links.\n- Verified keyboard focus on a scrollable table region produces a visible 3px solid outline.\n- Verified direct navigation to `/help#compact-glossary` lands at the requested heading.\n- Reproduced `/help` at exactly 390×844 CSS pixels: document width 375px, article width 355px, responsive image width 321px, and the 680px-wide table is contained inside its 319px scroll region without page-level horizontal overflow.\n- Confirmed current Vercel production `/help` returns the canonical guide and six images; APPGUIDE-002 will independently repeat production verification after navigation is added.\n- Privacy/source review found no second hand-maintained guide prose or committed generated screenshot directory.\n\n### Audit-harness calibration note\n\nIndependent run `32930468876` initially failed only because the Auditor helper expected a different valid phrase in `documentation/frontend-route-map.md`. The repository already correctly documented `/help`; no application or project implementation was changed. The Auditor-only assertion was corrected and the full independent run then passed.\n\n### Findings\n\n- Every APPGUIDE-001 acceptance criterion passes.\n- There is no correction set.\n- APPGUIDE-002 is the only authorised successor and owns Help navigation plus final production completion.\n\n**Complete correction set:** none.  \n**Next gate:** APPGUIDE-002.\n'''
audit_path.write_text(audit)

# Mark APPGUIDE-001 done and promote exactly APPGUIDE-002.
plan = plan.replace(
    '| APPGUIDE-001 | **IN REVIEW** | Render canonical guide at `/help` |',
    '| APPGUIDE-001 | **DONE** | Render canonical guide at `/help` |',
    1,
)
plan = plan.replace(
    '| APPGUIDE-002 | **PLANNED** | Navigation and production completion |',
    '| APPGUIDE-002 | **NEXT** | Navigation and production completion |',
    1,
)
heading = '## Current controller handoff'
assert heading in plan
plan = plan[:plan.index(heading)] + f'''## Current controller handoff\n\n```yaml\ntask_id: APPGUIDE-002\nhandoff_owner: PRODUCER\nhandoff_status: AUTHORISED\ncurrent_status: NEXT\nproject_status: ACTIVE\ncompleted_task: APPGUIDE-001\naudit_decision: PASS\naudit_record: documentation/in-app-user-guide-audits/APPGUIDE-001.md\nimplementation_reviewed: 7f0b31f939e49b4c6b9f40bcb068aba30766d92e^..1a336ee074a2d7177984c425ddc3ca0c948d4732\nindependent_evidence: GitHub Actions run 32930590164 / job 98061927379\ndata_or_schema_effects: none\nnext_action: Producer retrieves authoritative state fresh, records BUILD_ATTEMPT_STARTED and implements APPGUIDE-002 navigation and production completion only\n```\n'''
plan_path.write_text(plan)

old_state = '''project_status: ACTIVE\nactive_task: APPGUIDE-001\nactive_task_status: IN REVIEW\nhandoff_owner: AUDITOR\nhandoff_status: READY_FOR_AUDIT\ncompleted_task: none\naudit_decision: PENDING\nnext_action: Auditor independently audits APPGUIDE-001 rendering gate only'''
new_state = f'''project_status: ACTIVE\nactive_task: APPGUIDE-002\nactive_task_status: NEXT\nhandoff_owner: PRODUCER\nhandoff_status: AUTHORISED\ncompleted_task: APPGUIDE-001\naudit_decision: PASS\nnext_action: Producer retrieves authoritative state fresh, records BUILD_ATTEMPT_STARTED and implements APPGUIDE-002 only'''
assert old_state in journal
journal = journal.replace(old_state, new_state, 1)
journal += f'''\n\n### {now} — AUDIT_DECISION\n\n```yaml\nevent: AUDIT_DECISION\ntask_id: APPGUIDE-001\ncontroller: AUDITOR\ndecision: PASS\nimplementation_commit_or_range_reviewed: 7f0b31f939e49b4c6b9f40bcb068aba30766d92e^..1a336ee074a2d7177984c425ddc3ca0c948d4732\nproducer_evidence_commit_reviewed: 3448ae0aff8ffac6873d41b686645802b9b6e06b\naudit_record: documentation/in-app-user-guide-audits/APPGUIDE-001.md\nindependent_evidence: GitHub Actions run 32930590164 / job 98061927379\nchecks_performed:\n  - exact eight-file functional range independently inspected\n  - canonical single-source and no-copy contract verified\n  - 22 relative documentation links resolved\n  - six generated screenshots byte-matched to canonical sources and loaded with alt text\n  - 9/9 tests, palette compliance and production build independently passed\n  - local production-mode desktop and 390x844 Help rendering independently passed\n  - heading anchors, visible keyboard focus and contained table scrolling independently passed\n  - current Vercel /help canonical render confirmed as supporting evidence\ncomplete_correction_set: none\nnext_task_promoted: APPGUIDE-002\nhandoff_owner_after_audit: PRODUCER\nexact_next_action: Producer implements APPGUIDE-002 navigation and production completion only; Auditor does not implement that gate\n```\n'''
journal_path.write_text(journal)

print('APPGUIDE_001_PASS_PERSISTED', now)
