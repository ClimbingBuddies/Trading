from pathlib import Path
from datetime import datetime
from zoneinfo import ZoneInfo
import re
import subprocess

from PIL import Image, ImageStat
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

REPO = Path('.')
PLAN = Path('documentation/user-guide-project-plan.md')
JOURNAL = Path('documentation/user-guide-controller-journal.md')
GUIDE = Path('documentation/user-guide.md')
README = Path('documentation/README.md')
ROUTES = Path('documentation/frontend-route-map.md')
EVIDENCE = Path('documentation/user-guide-audits/UGUIDE-005.md')


def sh(*args):
    return subprocess.check_output(list(args), text=True).strip()


def commit(message, *paths):
    subprocess.check_call(['git', 'add', *paths])
    subprocess.check_call(['git', 'commit', '-m', message])
    return sh('git', 'rev-parse', 'HEAD')


subprocess.check_call(['git', 'config', 'user.name', 'ClimbingBuddies User Guide Producer'])
subprocess.check_call(['git', 'config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com'])
now = datetime.now(ZoneInfo('Australia/Perth')).isoformat(timespec='seconds')
start = sh('git', 'rev-parse', 'HEAD')

# 1. Record BUILD_ATTEMPT_STARTED before material work.
journal = JOURNAL.read_text()
expected = '''project_status: ACTIVE
active_task: UGUIDE-005
active_task_status: NEXT
handoff_owner: PRODUCER
handoff_status: AUTHORISED
last_updated: 2026-08-26T11:00:46+08:00
completed_task: UGUIDE-004
audit_decision: PASS_WITH_ADVICE
next_action: Producer reads the updated authoritative records, records BUILD_ATTEMPT_STARTED and executes UGUIDE-005 final assembly and publication QA only'''
replacement = f'''project_status: ACTIVE
active_task: UGUIDE-005
active_task_status: IN PROGRESS
handoff_owner: PRODUCER
handoff_status: IN PROGRESS
last_updated: {now}
completed_task: UGUIDE-004
audit_decision: PASS_WITH_ADVICE
next_action: complete UGUIDE-005 final assembly, production reconciliation and publication QA, then hand to Auditor'''
if expected not in journal:
    raise SystemExit('UGUIDE-005 state drifted; refusing to guess.')
journal = journal.replace(expected, replacement, 1)
journal += f'''\n\n### {now} — BUILD_ATTEMPT_STARTED\n\n```yaml\nevent: BUILD_ATTEMPT_STARTED\ntask_id: UGUIDE-005\ncontroller: PRODUCER\nstarting_commit: {start}\nplan_state_observed: UGUIDE-001 through UGUIDE-004 DONE; UGUIDE-005 NEXT\nhandoff_observed: AUTHORISED to PRODUCER with UGUIDE-004 PASS_WITH_ADVICE and no unresolved HANDOFF_QUERY\nintended_scope: reconcile canonical guide and route documentation against current production, validate routes/links/images/privacy, clean temporary guide artifacts, link the final guide from documentation/README.md and submit UGUIDE-005 for independent audit only\ntimestamp: {now}\n```\n'''
JOURNAL.write_text(journal)
start_commit = commit('docs(UGUIDE-005): start final publication QA', JOURNAL.as_posix())

# 2. Final assembly / reconciliation.
guide = GUIDE.read_text()
old_status = '**Guide status:** public research, private monitoring, Strategy interpretation and operational support documented; UGUIDE-004 is ready for independent audit and final publication QA remains  '
new_status = '**Guide status:** final publication candidate; all guide sections are assembled and UGUIDE-005 independent audit is pending  '
if old_status not in guide:
    raise SystemExit('Expected guide status not found.')
GUIDE.write_text(guide.replace(old_status, new_status, 1))

readme = README.read_text()
old_index = '- [Platform user guide](user-guide.md) — canonical deliverable under construction'
new_index = '- [Platform user guide](user-guide.md) — canonical user documentation for the production platform'
if old_index not in readme:
    raise SystemExit('Expected README guide index entry not found.')
README.write_text(readme.replace(old_index, new_index, 1))

routes = ROUTES.read_text()
if '| `/` | Redirect to the main Markets workspace | None | Public |' not in routes:
    raise SystemExit('Expected stale root-route statement not found.')
routes = routes.replace('**Last reconciled:** 25 August 2026', '**Last reconciled:** 26 August 2026', 1)
routes = routes.replace('| `/` | Redirect to the main Markets workspace | None | Public |', '| `/` | Redirect to the Admin operational dashboard | None | Public |', 1)
ROUTES.write_text(routes)
functional_commit = commit('docs(UGUIDE-005): reconcile final user guide publication', GUIDE.as_posix(), README.as_posix(), ROUTES.as_posix())

# 3. Repository, image, privacy and production QA.
guide = GUIDE.read_text()
md_link = re.compile(r'(?<!!)\[[^\]]+\]\(([^)]+)\)')
img_link = re.compile(r'!\[[^\]]*\]\(([^)]+)\)')
relative_links = []
for target in md_link.findall(guide):
    target = target.strip().split('#', 1)[0]
    if not target or '://' in target or target.startswith('mailto:'):
        continue
    if not (GUIDE.parent / target).resolve().exists():
        raise AssertionError(f'broken guide link: {target}')
    relative_links.append(target)

images = []
for target in img_link.findall(guide):
    target = target.strip()
    path = GUIDE.parent / target
    if not path.exists():
        raise AssertionError(f'broken guide image: {target}')
    image = Image.open(path)
    image.verify()
    image = Image.open(path).convert('RGB')
    stddev = ImageStat.Stat(image.convert('L')).stddev[0]
    if stddev < 10:
        raise AssertionError(f'blank/degenerate image: {target}')
    images.append((target, image.size, round(stddev, 2)))
if len(images) != 6:
    raise AssertionError(f'expected six delivered images under AUTH_REQUIRED exception; found {len(images)}')

lines = guide.splitlines()
for i, line in enumerate(lines):
    match = re.match(r'!\[([^\]]+)\]\(([^)]+)\)', line.strip())
    if not match:
        continue
    alt, target = match.groups()
    if len(alt.strip()) < 20:
        raise AssertionError(f'weak image alt text: {target}')
    j = i + 1
    while j < len(lines) and not lines[j].strip():
        j += 1
    if j >= len(lines) or not (lines[j].strip().startswith('*') and lines[j].strip().endswith('*')):
        raise AssertionError(f'missing image caption: {target}')

for phrase in ['does **not** place live trades', 'not personalised financial advice', 'VALIDATE_ROBUSTNESS / continue_testing', 'AUTH_REQUIRED — owner screenshot', 'AUTH_REQUIRED — Strategy screenshot', 'Compact glossary', 'Common troubleshooting']:
    if phrase not in guide:
        raise AssertionError(f'missing required wording: {phrase}')
if re.search(r'\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b', guide, re.I):
    raise AssertionError('guide contains an email address')
for pattern in [r'eyJ[a-zA-Z0-9_-]{20,}', r'sb_secret_[A-Za-z0-9_-]+', r'sk-[A-Za-z0-9]{20,}']:
    if re.search(pattern, guide):
        raise AssertionError(f'guide contains secret-like pattern: {pattern}')

allowed = {'documentation/user-guide.md', 'documentation/user-guide-project-plan.md', 'documentation/user-guide-controller-journal.md'}
suspicious = []
for p in Path('documentation').rglob('*user-guide*'):
    if not p.is_file():
        continue
    s = p.as_posix()
    if s.startswith('documentation/user-guide-audits/') or s.startswith('documentation/images/user-guide/') or s in allowed:
        continue
    suspicious.append(s)
if suspicious:
    raise AssertionError(f'unexpected/superseded user-guide artifacts: {suspicious}')

helpers = [p for p in Path('.github/workflows').glob('ug00*-*.yml') if p.name != 'ug005-producer-finalise.yml']
if helpers:
    raise AssertionError(f'stale temporary user-guide workflows: {[p.as_posix() for p in helpers]}')

opts = webdriver.ChromeOptions()
opts.add_argument('--headless=new')
opts.add_argument('--no-sandbox')
opts.add_argument('--disable-dev-shm-usage')
opts.add_argument('--disable-gpu')
opts.add_argument('--window-size=1363,936')
driver = webdriver.Chrome(options=opts)
wait = WebDriverWait(driver, 25)
checked = []
try:
    driver.get('https://discoverbouldersmarkets.vercel.app/')
    wait.until(EC.text_to_be_present_in_element((By.TAG_NAME, 'body'), 'Admin / Data Load Monitoring'))
    if not driver.current_url.rstrip('/').endswith('/admin'):
        raise AssertionError(f'root did not resolve to /admin: {driver.current_url}')
    checked.append(('/', '/admin'))

    for route, marker in [
        ('/admin', 'Admin / Data Load Monitoring'),
        ('/markets', 'Markets / Instrument Overview'),
        ('/markets/amd', 'AMD'),
        ('/assessments', 'Assessments'),
        ('/assessments/gld', 'GLD'),
        ('/opportunities', 'Opportunity'),
        ('/opportunities/ai_advanced_packaging', 'Advanced Packaging'),
    ]:
        driver.get('https://discoverbouldersmarkets.vercel.app' + route)
        wait.until(EC.text_to_be_present_in_element((By.TAG_NAME, 'body'), marker))
        text = driver.find_element(By.TAG_NAME, 'body').text
        if re.search(r'\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b', text, re.I):
            raise AssertionError(f'public route exposes email: {route}')
        checked.append((route, marker))

    driver.delete_all_cookies()
    for route, marker in [('/watchlists', 'Sign in to use watchlists'), ('/alerts', 'Sign in to use alerts'), ('/strategies', 'Sign in to view strategy evidence')]:
        driver.get('https://discoverbouldersmarkets.vercel.app' + route)
        wait.until(EC.text_to_be_present_in_element((By.TAG_NAME, 'body'), marker))
        checked.append((route, marker))

    driver.execute_cdp_cmd('Emulation.setDeviceMetricsOverride', {'width': 390, 'height': 844, 'deviceScaleFactor': 1, 'mobile': False})
    driver.get('https://discoverbouldersmarkets.vercel.app/markets')
    wait.until(EC.text_to_be_present_in_element((By.TAG_NAME, 'body'), 'Markets / Instrument Overview'))
    metrics = driver.execute_script('''
      const nav=document.querySelector('.sideNav nav'); const item=document.querySelector('.navItem');
      const header=document.querySelector('.pageHeader'); const table=document.querySelector('.tableScroll');
      const filter=document.querySelector('.filterTab'); return {w:innerWidth,h:innerHeight,doc:document.documentElement.scrollWidth,
      navClient:nav.clientWidth,navScroll:nav.scrollWidth,itemH:item.getBoundingClientRect().height,
      flex:getComputedStyle(header).flexDirection,tableClient:table.clientWidth,tableScroll:table.scrollWidth,
      filterH:filter.getBoundingClientRect().height};
    ''')
    if not (metrics['w'] == 390 and metrics['h'] == 844 and metrics['doc'] <= 390 and metrics['navScroll'] > metrics['navClient'] and metrics['itemH'] >= 43 and metrics['flex'] == 'column' and metrics['tableScroll'] > metrics['tableClient'] and metrics['filterH'] >= 43):
        raise AssertionError(f'mobile production contract failed: {metrics}')
finally:
    driver.quit()

print('LINKS_OK', len(relative_links))
print('IMAGES_OK', images)
print('ROUTES_OK', checked)
print('MOBILE_OK', metrics)

# 4. Producer evidence.
now = datetime.now(ZoneInfo('Australia/Perth')).isoformat(timespec='seconds')
EVIDENCE.write_text(f'''# UGUIDE-005 — Producer final assembly and publication QA evidence\n\n**Gate:** Final assembly and publication QA  \n**Producer state:** READY_FOR_AUDIT  \n**Functional implementation commit:** `{functional_commit}`  \n**Data or schema effects:** none  \n**Evidence timestamp:** {now} (Australia/Perth)\n\n## Final assembly completed\n\n- Reconciled `documentation/frontend-route-map.md` so production `/` correctly redirects to `/admin`; updated its reconciliation date.\n- Updated `documentation/README.md` so the Platform User Guide is linked as canonical production user documentation rather than an under-construction artifact.\n- Updated the guide status to a final publication candidate pending independent UGUIDE-005 audit.\n- Retained explicit `AUTH_REQUIRED` disclosures for Watchlists, Alerts and Strategy owner screenshots because no already-authorised permanent-owner session was available; no private state was fabricated.\n- Retained six genuine delivered screenshots; the three owner-only manifest entries remain policy exceptions under the authenticated-screenshot rule.\n\n## Publication QA\n\n- Production `/` resolved to `/admin`.\n- Verified `/admin`, `/markets`, `/markets/amd`, `/assessments`, `/assessments/gld`, `/opportunities`, `/opportunities/ai_advanced_packaging`, plus signed-out `/watchlists`, `/alerts` and `/strategies`.\n- Re-verified `/markets` at 390 × 844 CSS pixels with no page-level horizontal overflow, horizontally scrollable primary navigation and market table, stacked header and >=44px navigation/filter controls.\n- Every relative Markdown link in the guide resolves.\n- All six embedded guide images resolve, decode as real images, have meaningful alt text and immediate explanatory captions.\n- No-live-trading, non-personalised-advice and `VALIDATE_ROBUSTNESS / continue_testing` boundaries remain explicit.\n- Privacy/secret scan found no email, JWT, API-key or common secret pattern.\n- No superseded user-guide draft or stale temporary user-guide workflow remained before current transient UGUIDE-005 tooling.\n\n## Known limitations / policy exceptions\n\n- `watchlists-owner-desktop.png`, `alerts-owner-desktop.png` and `strategy-result-desktop.png` remain absent under `AUTH_REQUIRED`; no already-authorised permanent-owner Trading session was available. The screenshot policy requires this disclosure rather than requesting credentials or inventing private evidence.\n- Screenshot values are point-in-time examples; captions direct readers to current timestamps and labels.\n\n## Exact next action\n\nMove UGUIDE-005 to `IN REVIEW` under AUDITOR. The Auditor independently reconciles functional commit `{functional_commit}`, current production, six delivered screenshots and the authenticated-screenshot policy exception. Only the Auditor may mark UGUIDE-005 DONE and record `USER_GUIDE_PROJECT_COMPLETE`.\n''')
evidence_commit = commit('docs(UGUIDE-005): record final publication QA evidence', EVIDENCE.as_posix())

# 5. Plan transition to IN REVIEW.
plan = PLAN.read_text()
if '| UGUIDE-005 | **NEXT** | Final assembly and publication QA |' not in plan:
    raise SystemExit('UGUIDE-005 no longer NEXT in plan.')
plan = plan.replace('| UGUIDE-005 | **NEXT** | Final assembly and publication QA |', '| UGUIDE-005 | **IN REVIEW** | Final assembly and publication QA |', 1)
idx = plan.index('## Current controller handoff')
plan = plan[:idx] + f'''## Current controller handoff\n\n```yaml\ntask_id: UGUIDE-005\nhandoff_owner: AUDITOR\nhandoff_status: READY_FOR_AUDIT\ncurrent_status: IN REVIEW\nimplementation_commit_or_range:\n  functional_commit: {functional_commit}\n  producer_evidence_commit: {evidence_commit}\nfiles_changed:\n  implementation:\n    - documentation/user-guide.md\n    - documentation/README.md\n    - documentation/frontend-route-map.md\n  current_delivery_control:\n    - documentation/user-guide-audits/UGUIDE-005.md\n    - documentation/user-guide-project-plan.md\n    - documentation/user-guide-controller-journal.md\nscreenshots_added_or_replaced: none; six existing production screenshots revalidated; three owner-only entries remain AUTH_REQUIRED under policy\nroutes_and_viewports_verified:\n  desktop_1363x936: / -> /admin; /admin; /markets; /markets/amd; /assessments; /assessments/gld; /opportunities; /opportunities/ai_advanced_packaging; signed-out /watchlists; /alerts; /strategies\n  narrow_390x844: /markets\ndata_or_schema_effects: none\ntests_and_checks:\n  - root-route documentation reconciled to production / -> /admin\n  - canonical guide linked from documentation/README.md as production user documentation\n  - all relative guide Markdown links resolve\n  - all six delivered images resolve, decode, have meaningful alt text and immediate captions\n  - public and signed-out private route examples resolve in current production\n  - narrow Markets behaviour reverified\n  - privacy/secret-pattern scan passed\n  - superseded/stale user-guide artifact scan passed\nknown_limitations:\n  - Watchlists, Alerts and Strategy owner screenshots remain AUTH_REQUIRED because no already-authorised permanent-owner Trading session was available; no private evidence was fabricated\nacceptance_criteria_evidence:\n  canonical_guide: documentation/user-guide.md\n  documentation_index: documentation/README.md\n  reconciled_route_map: documentation/frontend-route-map.md\n  producer_evidence: documentation/user-guide-audits/UGUIDE-005.md\nexact_next_action: Auditor independently audits UGUIDE-005 only; on PASS it marks UGUIDE-005 DONE, records USER_GUIDE_PROJECT_COMPLETE and promotes no successor\n```\n'''
PLAN.write_text(plan)
plan_commit = commit('docs(UGUIDE-005): move final publication QA to review', PLAN.as_posix())

# 6. Complete handoff in journal.
now = datetime.now(ZoneInfo('Australia/Perth')).isoformat(timespec='seconds')
journal = JOURNAL.read_text()
pattern = re.compile(r'project_status: ACTIVE\nactive_task: UGUIDE-005\nactive_task_status: IN PROGRESS\nhandoff_owner: PRODUCER\nhandoff_status: IN PROGRESS\nlast_updated: [^\n]+\ncompleted_task: UGUIDE-004\naudit_decision: PASS_WITH_ADVICE\nnext_action: complete UGUIDE-005 final assembly, production reconciliation and publication QA, then hand to Auditor')
if not pattern.search(journal):
    raise SystemExit('UGUIDE-005 journal state drifted before handoff.')
journal = pattern.sub(f'''project_status: ACTIVE\nactive_task: UGUIDE-005\nactive_task_status: IN REVIEW\nhandoff_owner: AUDITOR\nhandoff_status: READY_FOR_AUDIT\nlast_updated: {now}\ncompleted_task: UGUIDE-004\naudit_decision: PENDING\nnext_action: Auditor independently audits UGUIDE-005 final assembly and publication QA; only Auditor may complete the project''', journal, count=1)
journal += f'''\n\n### {now} — PRODUCER_HANDOFF\n\n```yaml\nevent: PRODUCER_HANDOFF\ntask_id: UGUIDE-005\nhandoff_from: PRODUCER\nhandoff_to: AUDITOR\nhandoff_status: READY_FOR_AUDIT\nimplementation_commit_or_range:\n  functional_commit: {functional_commit}\n  producer_evidence_commit: {evidence_commit}\n  plan_transition_commit: {plan_commit}\nfiles_changed:\n  implementation:\n    - documentation/user-guide.md\n    - documentation/README.md\n    - documentation/frontend-route-map.md\n  delivery_control:\n    - documentation/user-guide-audits/UGUIDE-005.md\n    - documentation/user-guide-project-plan.md\n    - documentation/user-guide-controller-journal.md\nscreenshots_added_or_replaced: none; six delivered screenshots revalidated; owner-only Watchlists/Alerts/Strategy screenshots remain AUTH_REQUIRED under policy\nroutes_and_viewports_verified:\n  desktop_1363x936: / -> /admin; /admin; /markets; /markets/amd; /assessments; /assessments/gld; /opportunities; /opportunities/ai_advanced_packaging; signed-out /watchlists; /alerts; /strategies\n  narrow_390x844: /markets\ndata_or_schema_effects: none\ntests_and_checks:\n  - reconciled root route and documentation index\n  - verified every relative guide link and all six embedded images\n  - verified meaningful alt text and immediate captions\n  - verified live public routes and private signed-out boundaries\n  - reverified genuine narrow production behaviour\n  - privacy/secret-pattern scan passed\n  - stale/superseded user-guide artifact scan passed\nknown_limitations:\n  - no already-authorised permanent-owner Trading session existed for the three owner-only screenshots; AUTH_REQUIRED retained exactly as policy requires\nacceptance_criteria_evidence:\n  guide: documentation/user-guide.md\n  index: documentation/README.md\n  route_map: documentation/frontend-route-map.md\n  evidence: documentation/user-guide-audits/UGUIDE-005.md\nexact_next_action: Auditor independently audits the final gate. Producer must not mark UGUIDE-005 DONE or record USER_GUIDE_PROJECT_COMPLETE.\n```\n'''
JOURNAL.write_text(journal)
handoff_commit = commit('docs(UGUIDE-005): hand final user guide to auditor', JOURNAL.as_posix())

print('START_COMMIT', start_commit)
print('FUNCTIONAL_COMMIT', functional_commit)
print('EVIDENCE_COMMIT', evidence_commit)
print('PLAN_COMMIT', plan_commit)
print('HANDOFF_COMMIT', handoff_commit)
subprocess.check_call(['git', 'push', 'origin', 'HEAD:main'])
