from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

now = datetime.now(ZoneInfo('Australia/Perth')).isoformat(timespec='seconds')
plan_path = Path('documentation/user-guide-project-plan.md')
journal_path = Path('documentation/user-guide-controller-journal.md')
audit_path = Path('documentation/user-guide-audits/UGUIDE-005.md')
guide_path = Path('documentation/user-guide.md')

plan = plan_path.read_text()
journal = journal_path.read_text()
audit = audit_path.read_text()
guide = guide_path.read_text()

# Refuse to finalize through state drift.
assert '| UGUIDE-005 | **IN REVIEW** | Final assembly and publication QA |' in plan
assert 'task_id: UGUIDE-005\nhandoff_owner: AUDITOR\nhandoff_status: READY_FOR_AUDIT\ncurrent_status: IN REVIEW' in plan
assert 'active_task: UGUIDE-005\nactive_task_status: IN REVIEW\nhandoff_owner: AUDITOR\nhandoff_status: READY_FOR_AUDIT' in journal
assert '**Producer state:** READY_FOR_AUDIT' in audit
assert '**Guide status:** final publication candidate; all guide sections are assembled and UGUIDE-005 independent audit is pending' in guide

# Auditor owns only the terminal decision metadata, not substantive guide implementation.
guide = guide.replace(
    '**Guide status:** final publication candidate; all guide sections are assembled and UGUIDE-005 independent audit is pending  ',
    '**Guide status:** final production user guide; independently audited 26 August 2026  ',
    1,
)
guide_path.write_text(guide)

# Record independent final audit evidence.
audit += f'''\n\n## Independent Auditor decision\n\n**Decision:** PASS_WITH_ADVICE  \n**Audited at:** {now} (Australia/Perth)  \n**Functional implementation reviewed:** `2823eb3acd2a4bc171fa83d69c15928e47fe569c`  \n**Producer evidence reviewed:** `9d922bf89d3c1a58c8f9641285d754b6b24ae079`  \n**Independent browser QA:** GitHub Actions run `32927448601`, job `98053077104` — PASS  \n**Data or schema effects:** none\n\n### Independent checks performed\n\n- Retrieved the current project plan, controller journal, Producer evidence, guide and exact functional commit fresh from GitHub.\n- Confirmed the functional commit changes only `documentation/user-guide.md`, `documentation/README.md` and `documentation/frontend-route-map.md`.\n- Independently verified production `/` resolves to `/admin`, and checked `/admin`, `/markets`, `/markets/amd`, `/assessments`, `/assessments/gld`, `/opportunities` and `/opportunities/ai_advanced_packaging`.\n- Independently verified signed-out boundaries for `/watchlists`, `/alerts` and `/strategies`; no private owner state was substituted.\n- Reproduced `/markets` at exactly 390 × 844 CSS pixels: no page-level horizontal overflow, 44-pixel navigation/filter targets, horizontally scrollable navigation and table, stacked header and a full-width narrow search control.\n- Validated 22 relative guide links; all resolve.\n- Validated all six delivered screenshots as unique, decodable, non-blank images with meaningful alt text and immediate captions.\n- Confirmed `documentation/README.md` links the Platform User Guide as canonical production user documentation.\n- Confirmed `documentation/frontend-route-map.md` now matches production `/` → `/admin`.\n- Confirmed the guide retains the no-live-trading, non-personalised-advice, `AUTH_REQUIRED`, troubleshooting, glossary and `VALIDATE_ROBUSTNESS / continue_testing` boundaries.\n- Independently queried production Supabase: 30 active instruments; current quote data remains present; Daily Trend Pullback v1 remains `testing`, live execution disabled, the baseline run remains `succeeded` with 249 completed trades, and the persisted review remains `VALIDATE_ROBUSTNESS / continue_testing`.\n- Privacy and secret-pattern checks passed; no duplicate delivered screenshots or superseded user-guide drafts were found.\n\n### Findings\n\n- UGUIDE-005 passes and the complete User Guide project satisfies the final completion criteria.\n- The three owner-only screenshots remain absent under the explicit `AUTH_REQUIRED` policy because no already-authorised permanent-owner Trading session was available. This is a documented security-preserving exception, not a failed gate.\n- Six screenshots are therefore published rather than the nominal seven-to-nine target; the authenticated-screenshot rule takes precedence over fabricating or requesting private credentials.\n\n### Advice\n\n- If an already-authorised owner session becomes available later, the three owner screenshots may be added as a documentation enhancement and independently reviewed, but they are not required to reopen this completed project.\n- Re-audit screenshots if the visible production UI materially changes.\n\n**Complete correction set:** none.  \n**Final state:** `USER_GUIDE_PROJECT_COMPLETE`.\n'''
audit_path.write_text(audit)

# Mark the final gate done and terminate without successor.
plan = plan.replace(
    '| UGUIDE-005 | **IN REVIEW** | Final assembly and publication QA |',
    '| UGUIDE-005 | **DONE** | Final assembly and publication QA |',
    1,
)
start = plan.index('## Current controller handoff')
plan = plan[:start] + f'''## Current controller handoff\n\n```yaml\ntask_id: UGUIDE-005\nhandoff_owner: NONE\nhandoff_status: COMPLETE\ncurrent_status: DONE\ncompleted_task: UGUIDE-005\naudit_decision: PASS_WITH_ADVICE\naudit_record: documentation/user-guide-audits/UGUIDE-005.md\nfunctional_commit_reviewed: 2823eb3acd2a4bc171fa83d69c15928e47fe569c\nindependent_browser_evidence: GitHub Actions run 32927448601 / job 98053077104\nfinal_state: USER_GUIDE_PROJECT_COMPLETE\nknown_advice:\n  - owner-only screenshots remain AUTH_REQUIRED unless a future already-authorised owner session is available\n  - re-audit screenshots after material production UI changes\nnext_action: none; all five gates are DONE and no successor is promoted\n```\n'''
plan_path.write_text(plan)

old_state = '''project_status: ACTIVE\nactive_task: UGUIDE-005\nactive_task_status: IN REVIEW\nhandoff_owner: AUDITOR\nhandoff_status: READY_FOR_AUDIT\nlast_updated: 2026-08-26T11:07:45+08:00\ncompleted_task: UGUIDE-004\naudit_decision: PENDING\nnext_action: Auditor independently audits UGUIDE-005 final assembly and publication QA; only Auditor may complete the project'''
new_state = f'''project_status: USER_GUIDE_PROJECT_COMPLETE\nactive_task: UGUIDE-005\nactive_task_status: DONE\nhandoff_owner: NONE\nhandoff_status: COMPLETE\nlast_updated: {now}\ncompleted_task: UGUIDE-005\naudit_decision: PASS_WITH_ADVICE\nnext_action: none; User Guide project complete and no successor promoted'''
assert old_state in journal
journal = journal.replace(old_state, new_state, 1)
journal += f'''\n\n### {now} — AUDIT_DECISION\n\n```yaml\nevent: AUDIT_DECISION\ntask_id: UGUIDE-005\ncontroller: AUDITOR\ndecision: PASS_WITH_ADVICE\nimplementation_commit_or_range_reviewed: 2823eb3acd2a4bc171fa83d69c15928e47fe569c\nproducer_evidence_commit_reviewed: 9d922bf89d3c1a58c8f9641285d754b6b24ae079\naudit_record: documentation/user-guide-audits/UGUIDE-005.md\nindependent_browser_evidence: GitHub Actions run 32927448601 / job 98053077104\nchecks_performed:\n  - exact functional commit scope verified as documentation-only\n  - final guide index and root-route reconciliation independently verified\n  - 22 relative guide links resolved\n  - six unique delivered screenshots decoded, non-blank, captioned and accessible\n  - public production routes and signed-out private boundaries independently reproduced\n  - 390x844 Markets responsive behaviour independently reproduced\n  - production Supabase core counts and Strategy decision independently reconciled\n  - privacy, secret-pattern, duplicate-image and obsolete-artifact checks passed\nfindings:\n  - all final completion criteria pass under the explicit AUTH_REQUIRED screenshot policy\n  - owner-only screenshots remain a policy-permitted future enhancement, not a correction requirement\ncomplete_correction_set: none\nfinal_state: USER_GUIDE_PROJECT_COMPLETE\nnext_task_promoted: none\nexact_next_action: none; project is complete\n```\n'''
journal_path.write_text(journal)

print('UGUIDE_005_FINAL_DECISION_PERSISTED', now)
