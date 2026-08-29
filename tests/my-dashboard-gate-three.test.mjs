import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const componentPath = new URL('../components/MyDashboardClient.tsx', import.meta.url)
const dataPath = new URL('../lib/my-dashboard-data.ts', import.meta.url)

test('MYDASH-003 reads Watchlists and interests only through the authenticated owner boundary', async () => {
  const source = await readFile(dataPath, 'utf8')
  assert.match(source, /from\('watchlists'\)[\s\S]*eq\('owner_user_id', ownerId\)/)
  assert.match(source, /from\('user_market_interests'\)[\s\S]*eq\('owner_user_id', ownerId\)/)
  assert.match(source, /from\('watchlist_items'\)[\s\S]*in\('watchlist_id', batch\)/)
  assert.doesNotMatch(source, /service_role|SUPABASE_SERVICE/i)
})

test('MYDASH-003 derives relevance only from persisted watchlist, interest and Opportunity mappings', async () => {
  const source = await readFile(dataPath, 'utf8')
  assert.match(source, /const relevantInstrumentIds = \[\.\.\.new Set\(\[\.\.\.watchedInstrumentIds, \.\.\.interestedInstrumentIds\]\)\]/)
  assert.match(source, /from\('opportunity_theme_instruments'\)/)
  assert.match(source, /eq\('is_active', true\)/)
  assert.match(source, /const relevantThemeIds = \[\.\.\.new Set\(\[\.\.\.mappings\.map/)
  assert.match(source, /relatedThemeCount: new Set\([\s\S]*mapping\.theme_id[\s\S]*\)\.size/)
  assert.doesNotMatch(source, /gpt_market_assessments|market_scores|technical_indicators|market_convergence_assessments/)
})

test('MYDASH-003 selects one deterministic latest independent assessment per relevant theme', async () => {
  const source = await readFile(dataPath, 'utf8')
  assert.match(source, /from\('opportunity_assessments'\)/)
  assert.match(source, /order\('assessment_date', \{ ascending: false \}\)/)
  assert.match(source, /order\('updated_at', \{ ascending: false \}\)/)
  assert.match(source, /order\('id', \{ ascending: false \}\)/)
  assert.match(source, /limit\(1\)/)
  assert.match(source, /methodology_version/)
})

test('MYDASH-003 exposes provenance, relevance boundaries and explicit missing data', async () => {
  const component = await readFile(componentPath, 'utf8')
  assert.match(component, /Research relevance—not a recommendation/)
  assert.match(component, /An Opportunity score never becomes a Buy label here/)
  assert.match(component, /no blended personal score is calculated/i)
  assert.match(component, /Evidence date/)
  assert.match(component, /Methodology/)
  assert.match(component, /Why relevant/)
  assert.match(component, /Price unavailable/)
  assert.match(component, /No persisted quote or daily close was found/)
  assert.match(component, /No relevant Opportunity themes yet/)
})

test('MYDASH-003 preserves accessible tab navigation and narrow-screen structures', async () => {
  const component = await readFile(componentPath, 'utf8')
  assert.match(component, /role="tablist"/)
  assert.match(component, /ArrowRight/)
  assert.match(component, /ArrowLeft/)
  assert.match(component, /<WatchlistsPanel data=\{gateThreeData\} \/>/)
  assert.match(component, /<OpportunitiesPanel data=\{gateThreeData\} \/>/)
  assert.match(component, /key=\{`\$\{opportunity\.themeId\}-\$\{instrument\.instrumentId\}-\$\{instrument\.exposureType\}`\}/)
  assert.match(component, /Manage Watchlists/)
  assert.match(component, /Open full research evidence/)
})


test('MYDASH-003 supports existing-user password login without enabling public sign-up', async () => {
  const component = await readFile(componentPath, 'utf8')
  assert.match(component, /auth\.signInWithPassword\(/)
  assert.match(component, /autoComplete="current-password"/)
  assert.match(component, /shouldCreateUser: false/)
  assert.doesNotMatch(component, /shouldCreateUser: true/)
})
