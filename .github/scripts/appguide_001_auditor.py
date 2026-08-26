import hashlib
import re
import subprocess
import time
import urllib.request
from pathlib import Path

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

ROOT = Path('.')
CANONICAL = Path('documentation/user-guide.md')
BASE = 'd98904ecbb933e60ce3eddbef4d98cdbb489f890'
HEAD = '1a336ee074a2d7177984c425ddc3ca0c948d4732'
EXPECTED = sorted([
    '.gitignore',
    'app/help/help.module.css',
    'app/help/page.tsx',
    'documentation/frontend-route-map.md',
    'lib/user-guide.ts',
    'package.json',
    'scripts/sync-user-guide-assets.mjs',
    'tests/in-app-user-guide.test.mjs',
])

changed = subprocess.check_output(['git', 'diff', '--name-only', BASE, HEAD], text=True).splitlines()
changed = sorted(x for x in changed if x.strip())
assert changed == EXPECTED, (changed, EXPECTED)

markdown = CANONICAL.read_text()
page = Path('app/help/page.tsx').read_text()
loader = Path('lib/user-guide.ts').read_text()
css = Path('app/help/help.module.css').read_text()
route_map = Path('documentation/frontend-route-map.md').read_text()
nav = Path('components/AppNav.tsx').read_text()

# Single-source contract.
assert "loadUserGuideMarkdown" in page
assert "Discover Boulders Markets — User Guide" not in page
assert "documentation/user-guide.md" in loader
assert "USER_GUIDE_REPOSITORY_PATH" in loader
assert 'react-markdown' in page and 'remark-gfm' in page and 'rehype-slug' in page
assert 'skipHtml' in page
assert "{ href: '/help'" not in nav  # navigation is deliberately APPGUIDE-002
tracked_generated = subprocess.check_output(['git', 'ls-files', 'public/generated/user-guide'], text=True).strip()
assert tracked_generated == '', tracked_generated
unique_opening = 'Discover Boulders Markets is a research and monitoring platform. It does **not** place live trades'
for root in [Path('app'), Path('components'), Path('public')]:
    if not root.exists():
        continue
    for p in root.rglob('*'):
        if p.is_file() and p.suffix.lower() in {'.ts', '.tsx', '.js', '.jsx', '.md', '.txt', '.html'}:
            assert unique_opening not in p.read_text(errors='ignore'), f'duplicated guide prose in {p}'

# Theme/focus/overflow contract is explicit in the Help stylesheet.
for token in ['var(--theme-panel)', 'var(--theme-text)', 'var(--theme-accent)', 'var(--theme-border)']:
    assert token in css, token
assert ':focus-visible' in css
assert 'overflow-x: auto' in css
assert 'max-width: 100%' in css
assert not re.search(r'#[0-9a-fA-F]{3,8}\b|(?:rgb|rgba|hsl|hsla)\s*\(', css), 'raw colour literal in help CSS'

# Route documentation.
assert '| `/help` | Canonical in-app user guide' in route_map
assert '`documentation/user-guide.md`' in route_map
assert 'Public read-only' in route_map

# Canonical relative links all resolve in the checkout.
md_link = re.compile(r'(?<!!)\[[^\]]+\]\(([^)]+)\)')
relative_links = []
for raw in md_link.findall(markdown):
    target = raw.strip().split('#', 1)[0]
    if not target or target.startswith('/') or '://' in target or target.startswith(('mailto:', 'tel:')):
        continue
    resolved = (CANONICAL.parent / target).resolve()
    assert resolved.exists(), f'broken canonical relative link: {target}'
    relative_links.append(target)

# Generated images after prebuild/build must be byte-identical to the six canonical refs.
img_re = re.compile(r'!\[([^\]]*)\]\((images/user-guide/[^)\s]+)\)')
refs = img_re.findall(markdown)
assert len(refs) == 6, refs
for alt, ref in refs:
    assert len(alt.strip()) >= 20, ref
    canonical = CANONICAL.parent / ref
    generated = Path('public/generated/user-guide') / canonical.name
    assert canonical.exists() and generated.exists(), ref
    assert hashlib.sha256(canonical.read_bytes()).digest() == hashlib.sha256(generated.read_bytes()).digest(), ref

opts = webdriver.ChromeOptions()
opts.add_argument('--headless=new')
opts.add_argument('--no-sandbox')
opts.add_argument('--disable-dev-shm-usage')
opts.add_argument('--disable-gpu')
opts.add_argument('--window-size=1363,936')
driver = webdriver.Chrome(options=opts)
wait = WebDriverWait(driver, 30)

try:
    # Local production-mode server verification.
    local = 'http://127.0.0.1:3000/help'
    driver.get(local)
    wait.until(EC.text_to_be_present_in_element((By.TAG_NAME, 'body'), 'Discover Boulders Markets — User Guide'))
    article = driver.find_element(By.CSS_SELECTOR, 'article[data-guide-source="documentation/user-guide.md"]')
    assert article is not None
    assert driver.find_element(By.ID, 'before-you-begin').text == 'Before you begin'
    tables = driver.find_elements(By.CSS_SELECTOR, '[role="region"] > table')
    assert len(tables) >= 4, len(tables)
    images = driver.find_elements(By.CSS_SELECTOR, 'article img')
    assert len(images) == 6, len(images)
    for img in images:
        driver.execute_script('arguments[0].scrollIntoView({block:"center"});', img)
        WebDriverWait(driver, 10).until(lambda d, el=img: d.execute_script('return arguments[0].complete && arguments[0].naturalWidth > 0', el))
        assert len((img.get_attribute('alt') or '').strip()) >= 20
        assert '/generated/user-guide/' in (img.get_attribute('src') or '')
    href = driver.find_element(By.LINK_TEXT, 'Frontend route map').get_attribute('href')
    assert href == 'https://github.com/ClimbingBuddies/Trading/blob/main/documentation/frontend-route-map.md', href

    # Keyboard-visible focus on scrollable tables.
    region = driver.find_element(By.CSS_SELECTOR, '[role="region"]')
    driver.execute_script('arguments[0].focus();', region)
    focus = driver.execute_script('const s=getComputedStyle(arguments[0]); return {style:s.outlineStyle,width:s.outlineWidth};', region)
    assert focus['style'] != 'none' and focus['width'] != '0px', focus

    # Direct heading anchor lands at the requested section.
    driver.get(local + '#compact-glossary')
    heading = wait.until(EC.presence_of_element_located((By.ID, 'compact-glossary')))
    time.sleep(0.25)
    assert driver.execute_script('return location.hash') == '#compact-glossary'
    top = driver.execute_script('return arguments[0].getBoundingClientRect().top', heading)
    assert -5 <= top <= 160, top

    # Narrow-screen layout has no page-level horizontal overflow; table remains contained scroll.
    driver.execute_cdp_cmd('Emulation.setDeviceMetricsOverride', {'width':390,'height':844,'deviceScaleFactor':1,'mobile':False})
    driver.get(local)
    wait.until(EC.text_to_be_present_in_element((By.TAG_NAME, 'body'), 'Discover Boulders Markets — User Guide'))
    metrics = driver.execute_script('''
      const article=document.querySelector('article[data-guide-source]');
      const region=document.querySelector('[role="region"]');
      const img=document.querySelector('article img');
      return {
        w:innerWidth,h:innerHeight,doc:document.documentElement.scrollWidth,
        articleW:article.getBoundingClientRect().width,
        regionClient:region.clientWidth,regionScroll:region.scrollWidth,
        imageW:img.getBoundingClientRect().width
      };
    ''')
    assert metrics['w'] == 390 and metrics['h'] == 844, metrics
    assert metrics['doc'] <= 390, metrics
    assert metrics['articleW'] <= 370, metrics
    assert metrics['regionScroll'] > metrics['regionClient'], metrics
    assert metrics['imageW'] <= metrics['articleW'], metrics

    # Current production currently has the rendering gate deployed; APPGUIDE-002 will re-audit after nav changes.
    driver.execute_cdp_cmd('Emulation.clearDeviceMetricsOverride', {})
    driver.set_window_size(1363, 936)
    prod = 'https://discoverbouldersmarkets.vercel.app/help'
    driver.get(prod)
    wait.until(EC.text_to_be_present_in_element((By.TAG_NAME, 'body'), 'Discover Boulders Markets — User Guide'))
    assert driver.find_element(By.CSS_SELECTOR, 'article').get_attribute('data-guide-source') == 'documentation/user-guide.md'
    assert len(driver.find_elements(By.CSS_SELECTOR, 'article img')) == 6
finally:
    driver.quit()

print('APPGUIDE_001_AUDIT_PASS')
print('changed_files', changed)
print('relative_links', len(relative_links), sorted(set(relative_links)))
print('images', [ref for _, ref in refs])
print('mobile_metrics', metrics)
print('focus', focus)
