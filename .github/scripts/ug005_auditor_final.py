import hashlib
import re
import subprocess
from pathlib import Path

from PIL import Image, ImageStat
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

ROOT = Path('.')
GUIDE_PATH = Path('documentation/user-guide.md')
GUIDE = GUIDE_PATH.read_text()

# Exact functional target must be a bounded documentation-only reconciliation.
changed = subprocess.check_output(
    ['git', 'show', '--pretty=format:', '--name-only', '2823eb3acd2a4bc171fa83d69c15928e47fe569c'],
    text=True,
).splitlines()
changed = sorted(x for x in changed if x.strip())
expected_changed = sorted([
    'documentation/README.md',
    'documentation/frontend-route-map.md',
    'documentation/user-guide.md',
])
assert changed == expected_changed, (changed, expected_changed)

readme = Path('documentation/README.md').read_text()
route_map = Path('documentation/frontend-route-map.md').read_text()
assert '[Platform user guide](user-guide.md) — canonical user documentation for the production platform' in readme
assert '| `/` | Redirect to the Admin operational dashboard | None | Public |' in route_map
assert '**Last reconciled:** 26 August 2026' in route_map
assert '**Guide status:** final publication candidate;' in GUIDE

# Link and image integrity.
md_link = re.compile(r'(?<!!)\[[^\]]+\]\(([^)]+)\)')
img_link = re.compile(r'!\[([^\]]*)\]\(([^)]+)\)')
relative_links = []
for raw in md_link.findall(GUIDE):
    target = raw.strip().split('#', 1)[0]
    if not target or '://' in target or target.startswith('mailto:'):
        continue
    resolved = GUIDE_PATH.parent / target
    assert resolved.exists(), f'broken guide link: {target}'
    relative_links.append(target)

images = []
hashes = []
lines = GUIDE.splitlines()
for i, line in enumerate(lines):
    m = img_link.fullmatch(line.strip())
    if not m:
        continue
    alt, target = m.groups()
    assert len(alt.strip()) >= 20, f'weak alt text: {target}'
    p = GUIDE_PATH.parent / target
    assert p.exists(), f'missing image: {target}'
    data = p.read_bytes()
    hashes.append(hashlib.sha256(data).hexdigest())
    im = Image.open(p)
    im.verify()
    im = Image.open(p).convert('RGB')
    stddev = ImageStat.Stat(im.convert('L')).stddev[0]
    colours = len(set(im.resize((80, 80)).getdata()))
    assert stddev >= 10 and colours >= 80, f'degenerate image: {target}'
    j = i + 1
    while j < len(lines) and not lines[j].strip():
        j += 1
    assert j < len(lines) and lines[j].strip().startswith('*') and lines[j].strip().endswith('*'), f'missing caption: {target}'
    images.append((target, im.size, round(stddev, 2), colours))
assert len(images) == 6, images
assert len(set(hashes)) == len(hashes), 'duplicate delivered screenshots detected'

required = [
    'does **not** place live trades',
    'not personalised financial advice',
    'VALIDATE_ROBUSTNESS / continue_testing',
    'AUTH_REQUIRED — owner screenshot',
    'AUTH_REQUIRED — Strategy screenshot',
    'Compact glossary',
    'Common troubleshooting',
]
for phrase in required:
    assert phrase in GUIDE, phrase
assert not re.search(r'\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b', GUIDE, re.I), 'email in guide'
for pattern in [r'eyJ[a-zA-Z0-9_-]{20,}', r'sb_secret_[A-Za-z0-9_-]+', r'sk-[A-Za-z0-9]{20,}']:
    assert not re.search(pattern, GUIDE), f'secret-like pattern {pattern}'

# No obsolete user-guide drafts or stale helper files besides this current audit tooling.
allowed = {
    'documentation/user-guide.md',
    'documentation/user-guide-project-plan.md',
    'documentation/user-guide-controller-journal.md',
}
suspicious = []
for p in Path('documentation').rglob('*user-guide*'):
    if not p.is_file():
        continue
    s = p.as_posix()
    if s.startswith('documentation/user-guide-audits/') or s.startswith('documentation/images/user-guide/') or s in allowed:
        continue
    suspicious.append(s)
assert not suspicious, suspicious
workflow_helpers = [p.as_posix() for p in Path('.github/workflows').glob('ug00*-*.yml')]
assert workflow_helpers == ['.github/workflows/ug005-auditor-final.yml'], workflow_helpers
script_helpers = [p.as_posix() for p in Path('.github/scripts').glob('ug005*')]
assert script_helpers == ['.github/scripts/ug005_auditor_final.py'], script_helpers

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
    assert driver.current_url.rstrip('/').endswith('/admin'), driver.current_url
    checked.append(('/', driver.current_url, 'Admin / Data Load Monitoring'))

    public_routes = [
        ('/admin', 'Admin / Data Load Monitoring'),
        ('/markets', 'Markets / Instrument Overview'),
        ('/markets/amd', 'AMD'),
        ('/assessments', 'Assessments'),
        ('/assessments/gld', 'GLD'),
        ('/opportunities', 'Opportunity'),
        ('/opportunities/ai_advanced_packaging', 'Advanced Packaging'),
    ]
    for route, marker in public_routes:
        driver.get('https://discoverbouldersmarkets.vercel.app' + route)
        wait.until(EC.text_to_be_present_in_element((By.TAG_NAME, 'body'), marker))
        body = driver.find_element(By.TAG_NAME, 'body').text
        assert not re.search(r'\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b', body, re.I), f'email leak on {route}'
        checked.append((route, driver.current_url, marker))

    driver.delete_all_cookies()
    for route, marker in [
        ('/watchlists', 'Sign in to use watchlists'),
        ('/alerts', 'Sign in to use alerts'),
        ('/strategies', 'Sign in to view strategy evidence'),
    ]:
        driver.get('https://discoverbouldersmarkets.vercel.app' + route)
        wait.until(EC.text_to_be_present_in_element((By.TAG_NAME, 'body'), marker))
        checked.append((route, driver.current_url, marker))

    # Independent mobile rendering check and fresh ephemeral screenshot.
    driver.execute_cdp_cmd('Emulation.setDeviceMetricsOverride', {
        'width': 390, 'height': 844, 'deviceScaleFactor': 1, 'mobile': False,
    })
    driver.get('https://discoverbouldersmarkets.vercel.app/markets')
    wait.until(EC.text_to_be_present_in_element((By.TAG_NAME, 'body'), 'Markets / Instrument Overview'))
    metrics = driver.execute_script('''
      const nav=document.querySelector('.sideNav nav');
      const item=document.querySelector('.navItem');
      const header=document.querySelector('.pageHeader');
      const table=document.querySelector('.tableScroll');
      const filter=document.querySelector('.filterTab');
      const search=document.querySelector('.searchBox input');
      return {w:innerWidth,h:innerHeight,doc:document.documentElement.scrollWidth,
        navClient:nav.clientWidth,navScroll:nav.scrollWidth,itemH:item.getBoundingClientRect().height,
        flex:getComputedStyle(header).flexDirection,tableClient:table.clientWidth,tableScroll:table.scrollWidth,
        filterH:filter.getBoundingClientRect().height,searchW:search.getBoundingClientRect().width};
    ''')
    assert metrics['w'] == 390 and metrics['h'] == 844, metrics
    assert metrics['doc'] <= 390, metrics
    assert metrics['navScroll'] > metrics['navClient'] and metrics['tableScroll'] > metrics['tableClient'], metrics
    assert metrics['itemH'] >= 43 and metrics['filterH'] >= 43, metrics
    assert metrics['flex'] == 'column' and metrics['searchW'] >= 300, metrics
    fresh_path = '/tmp/ug005-auditor-mobile.png'
    driver.save_screenshot(fresh_path)
    fresh = Image.open(fresh_path)
    assert fresh.size == (390, 844), fresh.size
finally:
    driver.quit()

print('FUNCTIONAL_COMMIT_OK', changed)
print('LINKS_OK', len(relative_links), sorted(set(relative_links)))
print('IMAGES_OK', images)
print('ROUTES_OK', checked)
print('MOBILE_OK', metrics)
print('UGUIDE_005_AUDITOR_BROWSER_QA_PASS')
