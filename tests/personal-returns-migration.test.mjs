import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const migrationUrl = new URL('../supabase/migrations/20260906143500_my_dashboard_return_evaluator_v1.sql', import.meta.url)
const sql = await readFile(migrationUrl, 'utf8')

test('return snapshots match the approved immutable owner-scoped ledger', () => {
  assert.match(sql, /create table public\.personal_return_snapshots/)
  assert.match(sql, /foreign key \(decision_id, owner_user_id\)[\s\S]*references public\.personal_decisions\(id, owner_user_id\)/)
  assert.match(sql, /unique \(decision_id, checkpoint_code, evaluation_cutoff, calculation_version\)/)
  assert.match(sql, /before update or delete on public\.personal_return_snapshots/)
  assert.match(sql, /alter table public\.personal_return_snapshots enable row level security/)
  assert.match(sql, /owner_user_id = \(select auth\.uid\(\)\)/)
  assert.match(sql, /is_anonymous/)
})

test('browser roles can read only their snapshots while evaluator writes stay trusted', () => {
  assert.match(sql, /revoke all on table public\.personal_return_snapshots from public, anon, authenticated/)
  assert.match(sql, /grant select on table public\.personal_return_snapshots to authenticated/)
  assert.doesNotMatch(sql, /grant (insert|update|delete|all) on table public\.personal_return_snapshots to authenticated/)
  assert.match(sql, /grant all on table public\.personal_return_snapshots to service_role/)
  assert.match(sql, /revoke all on function public\.resolve_personal_decision_entry_v1\(uuid, timestamptz\) from public, anon, authenticated/)
  assert.match(sql, /grant execute on function public\.resolve_personal_decision_entry_v1\(uuid, timestamptz\) to service_role/)
})

test('entry resolution uses exactly one active Tiingo mapping and no fallback', () => {
  const resolver = sql.match(/create or replace function public\.resolve_personal_decision_entry_v1[\s\S]+?\$\$;/)?.[0] ?? ''
  assert.match(resolver, /dp\.provider_code = 'tiingo'/)
  assert.match(resolver, /dp\.is_active/)
  assert.match(resolver, /pi\.is_active/)
  assert.match(resolver, /v_provider_count <> 1/)
  assert.match(resolver, /'MAPPING_REQUIRED'/)
  assert.doesNotMatch(resolver, /coalesce\([^\n]*provider|order by dp\.id|provider_code <>/i)
})

test('entry is the first distinct canonical daily session after the decision clock', () => {
  const resolver = sql.match(/create or replace function public\.resolve_personal_decision_entry_v1[\s\S]+?\$\$;/)?.[0] ?? ''
  assert.match(resolver, /mo\.interval_code = '1day'/)
  assert.match(resolver, /mo\.observed_at > v_decision\.decision_at/)
  assert.match(resolver, /mo\.observed_at <= p_evaluation_cutoff/)
  assert.match(resolver, /row_number\(\) over \(partition by mo\.observed_at order by mo\.id\)/)
  assert.match(resolver, /where cs\.session_row = 1[\s\S]*order by cs\.observed_at[\s\S]*limit 1/)
  assert.doesNotMatch(resolver, /decision_at\s*[-+]\s*interval|current_date|extract\(dow/i)
})

test('future and pre-decision cutoffs fail without fabricating an entry', () => {
  const resolver = sql.match(/create or replace function public\.resolve_personal_decision_entry_v1[\s\S]+?\$\$;/)?.[0] ?? ''
  assert.match(resolver, /p_evaluation_cutoff > statement_timestamp\(\)/)
  assert.match(resolver, /p_evaluation_cutoff < v_decision\.decision_at/)
  assert.match(resolver, /'PENDING_ENTRY'/)
  assert.match(resolver, /'NO_ELIGIBLE_SESSION_AT_CUTOFF'/)
  assert.match(resolver, /null::bigint/)
})

test('ledger keeps missing evidence null and preserves source identities', () => {
  assert.match(sql, /entry_observation_id bigint references public\.market_observations\(id\)/)
  assert.match(sql, /exit_observation_id bigint references public\.market_observations\(id\)/)
  assert.match(sql, /source_identity_hash text not null/)
  assert.match(sql, /source_identity_hash ~ '\^\[0-9a-f\]\{64\}\$'/)
  assert.match(sql, /calculation_version = 'personal-forward-return-v1'/)
  assert.doesNotMatch(sql, /default 0[^-9]|coalesce\([^\n]*(price_return|benchmark_return|base_currency_return)/i)
})

test('return foundation contains no broker or order capability', () => {
  const table = sql.match(/create table public\.personal_return_snapshots \([\s\S]+?\n\);/)?.[0] ?? ''
  assert.doesNotMatch(table, /broker|account_number|api_key|order_id/i)
  assert.match(sql, /no broker or execution authority/i)
})
