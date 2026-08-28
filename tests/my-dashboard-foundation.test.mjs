import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const migrationPath = new URL('../supabase/migrations/20260827141424_my_dashboard_secure_personal_foundation_v1.sql', import.meta.url)
const componentPath = new URL('../components/MyDashboardClient.tsx', import.meta.url)

test('MYDASH-002 migration enforces permanent-user ownership on both personal tables', async () => {
  const sql = await readFile(migrationPath, 'utf8')
  for (const table of ['user_market_preferences', 'user_market_interests']) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, 'i'))
  }
  assert.ok((sql.match(/is_anonymous/g) ?? []).length >= 7)
  assert.ok((sql.match(/owner_user_id = \(select auth\.uid\(\)\)/g) ?? []).length >= 7)
  assert.match(sql, /revoke all on table public\.user_market_preferences from public, anon, authenticated/i)
  assert.match(sql, /revoke all on table public\.user_market_interests from public, anon, authenticated/i)
  assert.doesNotMatch(sql, /grant all on table public\.user_market_(preferences|interests) to authenticated/i)
})

test('MYDASH-002 shell exposes six accessible tabs and honest private states', async () => {
  const component = await readFile(componentPath, 'utf8')
  for (const key of ['today', 'recommendations', 'watchlists', 'opportunities', 'portfolio-health', 'decision-lab']) {
    assert.match(component, new RegExp(`key: '${key}'`))
  }
  assert.match(component, /role="tablist"/)
  assert.match(component, /ArrowRight/)
  assert.match(component, /ArrowLeft/)
  assert.match(component, /Anonymous sessions cannot open My Dashboard/)
  assert.match(component, /No placeholder recommendations, holdings or returns are fabricated/)
  assert.doesNotMatch(component, /service_role|SUPABASE_SERVICE/i)
})

test('MYDASH-002 invalidates stale private loads when the authenticated owner changes', async () => {
  const component = await readFile(componentPath, 'utf8')
  assert.match(component, /const activeOwnerRef = useRef<string \| null>\(null\)/)
  assert.match(component, /const loadGenerationRef = useRef\(0\)/)
  assert.match(component, /activeOwnerRef\.current === ownerId && loadGenerationRef\.current === loadGeneration/)
  assert.match(component, /if \(!isCurrentLoad\(\)\) return/g)
  assert.match(component, /activeOwnerRef\.current = null/)
})

test('MYDASH-002 resets all owner-scoped preferences at auth boundaries and missing rows', async () => {
  const component = await readFile(componentPath, 'utf8')
  assert.match(component, /setBaseCurrency\(DEFAULT_BASE_CURRENCY\)/g)
  assert.match(component, /setHorizon\(DEFAULT_HORIZON\)/g)
  assert.match(component, /setRisk\(DEFAULT_RISK\)/g)
  assert.match(component, /const ownerChanged = activeOwnerRef\.current !== nextOwnerId/)
  assert.match(component, /if \(ownerChanged\) clearPrivateState\(nextOwnerId\)/)
  assert.match(component, /if \(nextPreferences\)[\s\S]*else \{[\s\S]*setBaseCurrency\(DEFAULT_BASE_CURRENCY\)/)
})

test('MYDASH-002 preserves unsaved edits when an auth event keeps the same owner', async () => {
  const component = await readFile(componentPath, 'utf8')
  assert.match(component, /const ownerChanged = activeOwnerRef\.current !== nextOwnerId/)
  assert.match(component, /if \(ownerChanged\) clearPrivateState\(nextOwnerId\)/)
  assert.match(component, /if \(resolved && ownerChanged\) void loadPrivateData\(resolved\.id\)/)
  assert.doesNotMatch(component, /clearPrivateState\(resolved\?\.id \?\? null\)/)
})

test('MYDASH-002 keeps failed private-data results unknown and renders only retry state', async () => {
  const component = await readFile(componentPath, 'utf8')
  assert.match(component, /useState<DashboardCounts \| null>\(null\)/)
  assert.match(component, /setCounts\(null\)/g)
  assert.match(component, /setPrivateDataState\('error'\)/)
  assert.match(component, /privateDataState === 'error'/)
  assert.match(component, /PRIVATE DATA UNAVAILABLE/)
  assert.match(component, /\{privateDataState === 'error' \? \([\s\S]*\) : selectedTab === 'today' \? \(/)
  assert.match(component, /Personal counts and preferences remain hidden until the complete private-data load succeeds/)
})
