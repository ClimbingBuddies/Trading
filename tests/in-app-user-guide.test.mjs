import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { basename, join } from 'node:path'
import test from 'node:test'

const root = process.cwd()
const guidePath = join(root, 'documentation', 'user-guide.md')
const pagePath = join(root, 'app', 'help', 'page.tsx')
const loaderPath = join(root, 'lib', 'user-guide.ts')
const routeMapPath = join(root, 'documentation', 'frontend-route-map.md')
const packagePath = join(root, 'package.json')
const generatedRoot = join(root, 'public', 'generated', 'user-guide')

const guide = readFileSync(guidePath, 'utf8')
const page = readFileSync(pagePath, 'utf8')
const loader = readFileSync(loaderPath, 'utf8')
const routeMap = readFileSync(routeMapPath, 'utf8')
const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'))

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

test('help route reads the canonical user guide instead of copying guide prose', () => {
  assert.match(guide, /^# Discover Boulders Markets — User Guide/m)
  assert.match(loader, /USER_GUIDE_REPOSITORY_PATH = 'documentation\/user-guide\.md'/)
  assert.match(page, /loadUserGuideMarkdown\(\)/)
  assert.match(page, /data-guide-source=\{USER_GUIDE_REPOSITORY_PATH\}/)
  assert.doesNotMatch(page, /Discover Boulders Markets — User Guide/)
  assert.doesNotMatch(loader, /Discover Boulders Markets — User Guide/)
})

test('help route enables GFM tables and stable heading ids without raw HTML rendering', () => {
  assert.match(page, /remarkPlugins=\{\[remarkGfm\]\}/)
  assert.match(page, /rehypePlugins=\{\[rehypeSlug\]\}/)
  assert.match(page, /skipHtml/)
  assert.match(page, /className=\{styles\.tableScroll\}/)
  assert.match(page, /tabIndex=\{0\}/)
})

test('canonical relative documentation links are intentionally mapped back to GitHub', () => {
  assert.match(loader, /GITHUB_BLOB_BASE = 'https:\/\/github\.com\/ClimbingBuddies\/Trading\/blob\/main'/)
  assert.match(loader, /posix\.join\(USER_GUIDE_DIRECTORY, relativePath\)/)
  assert.match(loader, /href\.startsWith\('#'\) \|\| href\.startsWith\('\/'\)/)
})

test('build asset sync publishes exactly the screenshots referenced by canonical Markdown', () => {
  execFileSync(process.execPath, ['scripts/sync-user-guide-assets.mjs'], { cwd: root, stdio: 'pipe' })

  const refs = [...new Set([...guide.matchAll(/!\[[^\]]*\]\((images\/user-guide\/[^)\s]+)(?:\s+"[^"]*")?\)/g)].map((match) => match[1]))]
  assert.equal(refs.length, 6)

  const generated = readdirSync(generatedRoot).sort()
  const expected = refs.map((ref) => basename(ref)).sort()
  assert.deepEqual(generated, expected)

  for (const ref of refs) {
    const source = join(root, 'documentation', ...ref.split('/'))
    const destination = join(generatedRoot, basename(ref))
    assert.equal(existsSync(source), true)
    assert.equal(existsSync(destination), true)
    assert.equal(sha256(destination), sha256(source))
  }
})

test('route and build contracts include the public canonical help route', () => {
  assert.match(routeMap, /\| `\/help` \|/)
  assert.match(routeMap, /documentation\/user-guide\.md/)
  assert.equal(packageJson.scripts['sync:user-guide-assets'], 'node scripts/sync-user-guide-assets.mjs')
  assert.match(packageJson.scripts.prebuild, /sync:user-guide-assets/)
  assert.equal(packageJson.dependencies['react-markdown'], '^10.1.0')
  assert.equal(packageJson.dependencies['remark-gfm'], '^4.0.1')
  assert.equal(packageJson.dependencies['rehype-slug'], '^6.0.0')
})
