import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const migrationUrl = new URL('../supabase/migrations/20260902100905_my_dashboard_portfolio_health_v1.sql', import.meta.url)

test('portfolio health ownership is anchored through composite parent keys', async () => {
  const sql = await readFile(migrationUrl, 'utf8')

  assert.match(sql, /constraint portfolios_owner_identity_key unique \(id, owner_user_id\)/)
  assert.match(sql, /constraint portfolio_positions_parent_owner_fk[\s\S]*foreign key \(portfolio_id, owner_user_id\)[\s\S]*references public\.portfolios\(id, owner_user_id\)/)
  assert.match(sql, /constraint portfolio_health_snapshots_parent_owner_fk[\s\S]*foreign key \(portfolio_id, owner_user_id\)[\s\S]*references public\.portfolios\(id, owner_user_id\)/)
})

test('portfolio and position writes cannot reassign ownership or admit anonymous users', async () => {
  const sql = await readFile(migrationUrl, 'utf8')
  const permanentOwnerCheck = String.raw`\(select auth\.uid\(\)\) is not null and coalesce\(\(\(\(select auth\.jwt\(\)\)->>'is_anonymous'\)::boolean\), false\) = false and owner_user_id = \(select auth\.uid\(\)\)`

  for (const table of ['portfolios', 'portfolio_positions']) {
    assert.match(sql, new RegExp(`create policy ${table}_owner_insert[\\s\\S]*?with check \\((${permanentOwnerCheck})\\)`))
    assert.match(sql, new RegExp(`create policy ${table}_owner_update[\\s\\S]*?using \\((${permanentOwnerCheck})\\)[\\s\\S]*?with check \\((${permanentOwnerCheck})\\)`))
  }
})

test('browser roles can only read immutable owner-scoped health snapshots', async () => {
  const sql = await readFile(migrationUrl, 'utf8')

  assert.match(sql, /alter table public\.portfolio_health_snapshots enable row level security/)
  assert.match(sql, /create policy portfolio_health_snapshots_owner_select[\s\S]*owner_user_id = \(select auth\.uid\(\)\)/)
  assert.doesNotMatch(sql, /create policy portfolio_health_snapshots_owner_(insert|update|delete)/)
  assert.match(sql, /revoke all on table public\.portfolio_health_snapshots from public, anon, authenticated/)
  assert.match(sql, /grant select on table public\.portfolio_health_snapshots to authenticated/)
  assert.doesNotMatch(sql, /grant [^;]*(insert|update|delete)[^;]* on table public\.portfolio_health_snapshots to authenticated/)
})

test('owner RLS predicates use init-plan-safe auth calls and indexed owner columns', async () => {
  const sql = await readFile(migrationUrl, 'utf8')
  const policies = [...sql.matchAll(/(create policy ([a-z_]+) on public\.(portfolios|portfolio_positions|portfolio_health_snapshots)[\s\S]*?;)/g)]

  assert.equal(policies.length, 9)
  for (const [, statement, policyName, tableName] of policies) {
    assert.match(statement, /\(select auth\.uid\(\)\)/, `${policyName} on ${tableName} must cache auth.uid() through an init plan`)
    assert.match(statement, /\(select auth\.jwt\(\)\)/, `${policyName} on ${tableName} must cache auth.jwt() through an init plan`)
    assert.doesNotMatch(statement, /(?<!select )auth\.(uid|jwt)\(\)/, `${policyName} on ${tableName} must not evaluate auth helpers per row`)
  }

  assert.match(sql, /create index portfolios_owner_idx on public\.portfolios \(owner_user_id\)/)
  assert.match(sql, /create index portfolio_positions_owner_idx on public\.portfolio_positions \(owner_user_id\)/)
  assert.match(sql, /create index portfolio_health_snapshots_owner_portfolio_idx\s+on public\.portfolio_health_snapshots \(owner_user_id, portfolio_id, source_cutoff desc\)/)
})

test('exposed personal tables retain the least-privilege role matrix', async () => {
  const sql = await readFile(migrationUrl, 'utf8')
  const mutableTables = ['portfolios', 'portfolio_positions']
  const personalTables = [...mutableTables, 'portfolio_health_snapshots']

  for (const table of personalTables) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`))
    assert.match(sql, new RegExp(`revoke all on table public\\.${table} from public, anon, authenticated`))
    assert.match(sql, new RegExp(`grant all on table public\\.${table} to service_role`))
    assert.doesNotMatch(sql, new RegExp(`grant [^;]+ on table public\\.${table} to (public|anon)`))
  }

  for (const table of mutableTables) {
    assert.match(sql, new RegExp(`grant select, insert, update, delete on table public\\.${table} to authenticated`))
  }

  assert.match(sql, /grant select on table public\.portfolio_health_snapshots to authenticated/)
  assert.doesNotMatch(sql, /grant [^;]*(insert|update|delete)[^;]* on table public\.portfolio_health_snapshots to authenticated/)
})

test('portfolio deletion cascades owner children while snapshot history stays browser-immutable', async () => {
  const sql = await readFile(migrationUrl, 'utf8')

  assert.match(sql, /owner_user_id uuid not null references auth\.users\(id\) on delete cascade/g)
  assert.match(sql, /constraint portfolio_positions_parent_owner_fk[\s\S]*references public\.portfolios\(id, owner_user_id\)[\s\S]*on delete cascade/)
  assert.match(sql, /constraint portfolio_health_snapshots_parent_owner_fk[\s\S]*references public\.portfolios\(id, owner_user_id\)[\s\S]*on delete cascade/)
  assert.match(sql, /instrument_id uuid not null references public\.instruments\(id\) on delete restrict/)

  assert.doesNotMatch(sql, /create trigger portfolio_health_snapshots_/)
  assert.doesNotMatch(sql, /create policy portfolio_health_snapshots_owner_(insert|update|delete)/)
  assert.doesNotMatch(sql, /grant [^;]*(insert|update|delete)[^;]* on table public\.portfolio_health_snapshots to authenticated/)
})

test('position inputs and health outputs retain fail-closed validation constraints', async () => {
  const sql = await readFile(migrationUrl, 'utf8')

  assert.match(sql, /constraint portfolio_positions_quantity_check check \(quantity > 0\)/)
  assert.match(sql, /constraint portfolio_positions_average_cost_check check \(average_cost_per_unit is null or average_cost_per_unit >= 0\)/)
  assert.match(sql, /constraint portfolio_positions_currency_check check \(cost_currency = upper\(cost_currency\) and cost_currency ~ '\^\[A-Z\]\{3\}\$'\)/)
  assert.match(sql, /constraint portfolio_positions_source_check check \(position_source in \('manual', 'paper_decision'\)\)/)
  assert.match(sql, /constraint portfolio_positions_source_decision_check check \([\s\S]*?position_source = 'manual'[\s\S]*?position_source = 'paper_decision' and source_decision_id is not null[\s\S]*?\)/)

  assert.match(sql, /constraint portfolio_health_snapshots_total_value_check check \(total_value is null or total_value >= 0\)/)
  assert.match(sql, /constraint portfolio_health_snapshots_currency_check check \(base_currency = upper\(base_currency\) and base_currency ~ '\^\[A-Z\]\{3\}\$'\)/)
  assert.match(sql, /constraint portfolio_health_snapshots_measures_check check \(jsonb_typeof\(measures\) = 'object'\)/)
  assert.match(sql, /constraint portfolio_health_snapshots_status_check check \(summary_status in \('INCOMPLETE_DATA', 'NEEDS_REVIEW', 'HEALTHY'\)\)/)
  assert.match(sql, /constraint portfolio_health_snapshots_completeness_check check \(completeness_pct between 0 and 100\)/)
})

test('portfolio headers retain canonical identity and fail-closed validation constraints', async () => {
  const sql = await readFile(migrationUrl, 'utf8')

  assert.match(sql, /constraint portfolios_name_check check \(length\(btrim\(name\)\) between 1 and 120\)/)
  assert.match(sql, /constraint portfolios_kind_check check \(portfolio_kind in \('manual', 'paper'\)\)/)
  assert.match(sql, /constraint portfolios_currency_check check \(base_currency = upper\(base_currency\) and base_currency ~ '\^\[A-Z\]\{3\}\$'\)/)
  assert.match(sql, /constraint portfolios_status_check check \(status in \('active', 'archived'\)\)/)
  assert.match(sql, /constraint portfolios_target_allocations_check check \(target_allocations is null or jsonb_typeof\(target_allocations\) = 'object'\)/)
  assert.match(sql, /create unique index portfolios_owner_active_name_key\s+on public\.portfolios \(owner_user_id, lower\(btrim\(name\)\)\)\s+where status = 'active'/)
})

test('health snapshots retain immutable source identity and chronological audit fields', async () => {
  const sql = await readFile(migrationUrl, 'utf8')
  const snapshotTable = sql.match(/create table public\.portfolio_health_snapshots \([\s\S]*?\n\);/)?.[0]

  assert.ok(snapshotTable, 'snapshot table definition must exist')

  assert.match(snapshotTable, /source_cutoff timestamptz not null/)
  assert.match(snapshotTable, /evaluated_at timestamptz not null default clock_timestamp\(\)/)
  assert.match(snapshotTable, /methodology_version text not null/)
  assert.match(snapshotTable, /source_hash text not null/)
  assert.match(snapshotTable, /created_at timestamptz not null default clock_timestamp\(\)/)
  assert.match(snapshotTable, /constraint portfolio_health_snapshots_identity_key unique \(portfolio_id, source_cutoff, methodology_version\)/)
  assert.match(sql, /create index portfolio_health_snapshots_owner_portfolio_idx\s+on public\.portfolio_health_snapshots \(owner_user_id, portfolio_id, source_cutoff desc\)/)

  assert.doesNotMatch(sql, /create trigger portfolio_health_snapshots_touch_updated_at/)
  assert.doesNotMatch(snapshotTable, /\bupdated_at\b/)
})
