import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const migrationPath = new URL('../supabase/migrations/20260827141424_my_dashboard_secure_personal_foundation_v1.sql', import.meta.url)
const componentPath = new URL('../components/MyDashboardClient.tsx', import.meta.url)
const stylesPath = new URL('../components/MyDashboardClient.module.css', import.meta.url)
const pagePath = new URL('../app/my-dashboard/page.tsx', import.meta.url)
const loginComponentPath = new URL('../components/LoginClient.tsx', import.meta.url)

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
  assert.match(component, /Your private research workspace is ready/)
  assert.doesNotMatch(component, /Later gates will add|next MYDASH-004 slices/)
  assert.doesNotMatch(component, /service_role|SUPABASE_SERVICE/i)
})

test('MYDASH-008 preserves accessible, responsive and privacy-safe completion boundaries', async () => {
  const [component, styles, page] = await Promise.all([
    readFile(componentPath, 'utf8'),
    readFile(stylesPath, 'utf8'),
    readFile(pagePath, 'utf8'),
  ])

  assert.match(page, /<Suspense fallback=\{<section aria-live="polite">/)
  assert.match(component, /role="tab" aria-selected=\{selectedTab === tab\.key\} aria-controls=\{`my-dashboard-panel-\$\{tab\.key\}`\} tabIndex=\{selectedTab === tab\.key \? 0 : -1\}/)
  assert.match(component, /role="tabpanel" aria-labelledby=\{`my-dashboard-tab-\$\{selectedTab\}`\} tabIndex=\{0\}/)
  assert.match(component, /event\.key === 'Home'/)
  assert.match(component, /event\.key === 'End'/)
  assert.match(styles, /\.tabScroller\{overflow-x:auto/)
  assert.match(styles, /\.dashboard,\.dashboard>\*,\.panel\{min-width:0\}/)
  assert.match(styles, /\.tab,\.activeTab\{min-height:48px/)
  assert.match(styles, /@media\(max-width:780px\)[^{]*\{[^}]*[\s\S]*\.tab,\.activeTab\{min-height:44px/)
  assert.match(styles, /:focus-visible[^}]*outline:3px solid var\(--accent\)/)
  assert.doesNotMatch(component, /navigator\.sendBeacon|console\.(?:log|info|debug)|service_role|SUPABASE_SERVICE/i)
})

test('MYDASH-003 keeps the dashboard behind login and identifies the authenticated account', async () => {
  const component = await readFile(componentPath, 'utf8')
  assert.match(component, /router\.replace\('\/login\?next=\/my-dashboard'\)/)
  assert.match(component, /Signed in as/)
  assert.match(component, /user\.email \?\? 'authenticated user'/)
  assert.match(component, />Sign out</)
  assert.doesNotMatch(component, /signInWithOtp|Send secure link/)
})

test('MYDASH-003 login offers Google and email password with a safe dashboard return', async () => {
  const login = await readFile(loginComponentPath, 'utf8')
  assert.match(login, /signInWithPassword/)
  assert.match(login, /signUp/)
  assert.match(login, /signInWithOAuth/)
  assert.match(login, /provider: 'google'/)
  assert.match(login, /return value\?\.startsWith\('\/'\) && !value\.startsWith\('\/\/'\) \? value : '\/my-dashboard'/)
  assert.match(login, /redirectTo: `\$\{window\.location\.origin\}\$\{destination\}`/)
  assert.doesNotMatch(login, /provider: ['"]github['"]|signInWithOtp|magic link/i)
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

test('MYDASH-002 uses exact counts and paginates all rows needed for distinct instruments', async () => {
  const component = await readFile(componentPath, 'utf8')
  assert.match(component, /select\('id', \{ count: 'exact', head: true \}\)/g)
  assert.match(component, /watchlistsCountResult\.count === null \|\| interestsCountResult\.count === null/)
  assert.match(component, /\.range\(offset, offset \+ PAGE_SIZE - 1\)/g)
  assert.match(component, /WATCHLIST_ID_BATCH_SIZE/)
  assert.match(component, /new Set<string>\(\)/)
  assert.match(component, /watchedInstrumentIds\.add\(row\.instrument_id\)/)
  assert.doesNotMatch(component, /watchlists: listIds\.length/)
})

test('MYDASH-002 preference saves recover from same-owner cross-tab creation races', async () => {
  const component = await readFile(componentPath, 'utf8')
  assert.match(component, /\.update\(preferenceValues\)[\s\S]*\.eq\('owner_user_id', ownerId\)/)
  assert.match(component, /if \(!writeError && !updateResult\.data\)/)
  assert.match(component, /if \(writeError\?\.code === '23505'\)/)
  assert.match(component, /const retryResult = await supabase[\s\S]*\.update\(preferenceValues\)/)
  assert.doesNotMatch(component, /\.upsert\(payload/)
  assert.doesNotMatch(component, /\.update\(\{[^}]*owner_user_id/s)
})

test('MYDASH-002 keeps failed private-data results unknown and renders only retry state', async () => {
  const component = await readFile(componentPath, 'utf8')
  assert.match(component, /useState<DashboardCounts \| null>\(null\)/)
  assert.match(component, /setCounts\(null\)/g)
  assert.match(component, /setPrivateDataState\('error'\)/)
  assert.match(component, /privateDataState === 'error'/)
  assert.match(component, /PRIVATE DATA UNAVAILABLE/)
  assert.match(component, /privateDataState === 'error' \? \([\s\S]*\) : privateDataState !== 'ready' \|\| !counts \? \([\s\S]*\) : selectedTab === 'today' \? \(/)
  assert.match(component, /Personal counts and preferences remain hidden until the complete private-data load succeeds/)
})

test('MYDASH-004 loads and renders only owner-scoped portfolio rows with honest empty states', async () => {
  const component = await readFile(componentPath, 'utf8')
  assert.match(component, /\.from\('portfolios'\)[\s\S]*\.eq\('owner_user_id', ownerId\)/)
  assert.match(component, /select\('id,name,portfolio_kind,base_currency,status,updated_at'\)/)
  assert.match(component, /setPortfolios\(\(portfoliosResult\.data \?\? \[\]\) as Portfolio\[\]\)/)
  assert.match(component, /selectedTab === 'portfolio-health'/)
  assert.match(component, /No portfolio has been added/)
  assert.match(component, /missing holdings or values are never fabricated/)
  assert.match(component, /cannot place trades or connect to a broker/)
  assert.doesNotMatch(component, /service_role|SUPABASE_SERVICE/i)
})

test('MYDASH-004 creates only validated owner-scoped portfolio headers', async () => {
  const component = await readFile(componentPath, 'utf8')
  assert.match(component, /async function createPortfolio/)
  assert.match(component, /!\/\^\[A-Z\]\{3\}\$\/\.test\(currency\)/)
  assert.match(component, /\.from\('portfolios'\)[\s\S]*\.insert\(\{ owner_user_id: ownerId, name, portfolio_kind: portfolioKind, base_currency: currency \}\)/)
  assert.match(component, /\.select\('id,name,portfolio_kind,base_currency,status,updated_at'\)[\s\S]*\.single\(\)/)
  assert.match(component, /activeOwnerRef\.current !== ownerId/)
  assert.match(component, /An active portfolio with this name already exists/)
  assert.match(component, /It does not add holdings, calculate performance or place a trade/)
})

test('MYDASH-004 validates owner-scoped manual positions and preserves incomplete cost basis', async () => {
  const component = await readFile(componentPath, 'utf8')
  assert.match(component, /\.from\('instruments'\)[\s\S]*\.eq\('is_active', true\)/)
  assert.match(component, /async function createPosition/)
  assert.match(component, /portfolios\.some\(\(portfolio\) => portfolio\.id === positionPortfolioId\)/)
  assert.match(component, /Number\.isFinite\(quantity\) \|\| quantity <= 0/)
  assert.match(component, /averageCost !== null[\s\S]*averageCost < 0/)
  assert.match(component, /\.from\('portfolio_positions'\)[\s\S]*\.insert\(\{/)
  assert.match(component, /owner_user_id: ownerId/)
  assert.match(component, /position_source: 'manual'/)
  assert.match(component, /average_cost_per_unit: averageCost/)
  assert.match(component, /cost basis marked incomplete/)
  assert.match(component, /never places an order or contacts a broker/)
})

test('MYDASH-004 loads and displays only owner-scoped stored positions without inventing cost', async () => {
  const component = await readFile(componentPath, 'utf8')
  assert.match(component, /\.from\('portfolio_positions'\)[\s\S]*\.select\('id,portfolio_id,instrument_id,quantity,average_cost_per_unit,cost_currency,position_source,source_decision_id,updated_at'\)[\s\S]*\.eq\('owner_user_id', ownerId\)/)
  assert.match(component, /setPositions\(\(positionsResult\.data \?\? \[\]\) as PortfolioPosition\[\]\)/)
  assert.match(component, /setPositions\(\(current\) => \[data as PortfolioPosition, \.\.\.current\]\)/)
  assert.match(component, /position\.average_cost_per_unit === null \? 'Cost basis incomplete'/)
  assert.match(component, /instrument\?\.instrument_name \?\? 'Instrument details unavailable'/)
  assert.doesNotMatch(component, /instrument\?\.instrument_name \?\? position\.instrument_id/)
  assert.match(component, /No positions have been saved/)
  assert.match(component, /Holdings and cost values are never inferred/)
  assert.doesNotMatch(component, /average_cost_per_unit \?\? 0/)
})

test('MYDASH-004 bridges owner-scoped persisted Portfolio Health without browser-side calculation', async () => {
  const component = await readFile(componentPath, 'utf8')
  assert.match(component, /\.from\('portfolio_health_snapshots'\)[\s\S]*\.eq\('owner_user_id', ownerId\)/)
  assert.match(component, /\.order\('portfolio_id',[\s\S]*\.order\('source_cutoff',[\s\S]*\.order\('id',[\s\S]*\.range\(offset, offset \+ PAGE_SIZE - 1\)/)
  assert.match(component, /portfolios\.some\(\(portfolio\) => portfolio\.id === healthPortfolioId && portfolio\.status === 'active'\)/)
  assert.match(component, /functions\.invoke\('refresh-portfolio-health'/)
  assert.match(component, /body: \{ portfolio_id: healthPortfolioId, source_cutoff: new Date\(\)\.toISOString\(\) \}/)
  assert.match(component, /No calculated snapshot yet\./)
  assert.match(component, /Loading calculated Portfolio Health…/)
  assert.match(component, /Calculated health unavailable/)
  assert.match(component, /Incomplete evidence remains/)
  assert.match(component, /function summariseEvidenceReasons\(reasons: string\[\]\)/)
  assert.match(component, /MISSING_PRICE: \(count\) => `Current market price unavailable/)
  assert.match(component, /MISSING_THEME_MAPPING_EVIDENCE: \(count\) => `Opportunity-theme mapping unavailable/)
  assert.match(component, /summariseEvidenceReasons\(selectedHealthSnapshot\.completeness_reasons\)/)
  assert.doesNotMatch(component, /completeness_reasons\.map\(\(reason, index\)/)
  assert.match(component, /Source cutoff/)
  assert.match(component, /Methodology/)
  assert.match(component, /Source identity/)
  assert.match(component, /function validPortfolioHealthSnapshot\(value: unknown\): value is PortfolioHealthSnapshot/)
  assert.match(component, /if \(!rows\.every\(validPortfolioHealthSnapshot\)\) throw new Error/)
  assert.match(component, /activeOwnerRef\.current !== ownerId \|\| loadGenerationRef\.current !== loadGeneration/)
  assert.match(component, /healthErrorAction === 'load' \? loadPrivateData\(user\.id\) : refreshPortfolioHealth\(\)/)
  assert.match(component, /healthErrorAction === 'load' \? 'Reload private data' : 'Try refresh again'/)
  assert.doesNotMatch(component, /service_role|SUPABASE_SERVICE/i)
})

