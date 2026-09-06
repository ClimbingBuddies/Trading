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

test('checkpoint evaluator selects OPEN and exact forward session horizons without look-ahead', () => {
  const evaluator = sql.match(/create or replace function private\.evaluate_personal_return_checkpoint_v1[\s\S]+?\$\$;/)?.[0] ?? ''
  assert.match(evaluator, /p_checkpoint_code not in \('OPEN', '5D', '20D', '60D', 'EXIT'\)/)
  assert.match(evaluator, /mo\.observed_at >= v_entry_at[\s\S]*mo\.observed_at <= p_evaluation_cutoff[\s\S]*order by mo\.observed_at desc/)
  assert.match(evaluator, /when '5D' then 5 when '20D' then 20 else 60/)
  assert.match(evaluator, /mo\.observed_at > v_entry_at/)
  assert.match(evaluator, /row_number\(\) over \(order by mo\.observed_at, mo\.id\)/)
  assert.match(evaluator, /where ls\.session_number = v_target_sessions/)
  assert.doesNotMatch(evaluator, /current_date|decision_at\s*[-+]\s*interval|extract\(dow/i)
})

test('EXIT evaluation requires a persisted event and later canonical session', () => {
  const evaluator = sql.match(/create or replace function private\.evaluate_personal_return_checkpoint_v1[\s\S]+?\$\$;/)?.[0] ?? ''
  assert.match(evaluator, /e\.event_type = 'EXIT'/)
  assert.match(evaluator, /e\.event_at <= p_evaluation_cutoff/)
  assert.match(evaluator, /mo\.observed_at > v_exit_event_at/)
  assert.match(evaluator, /'EXIT_EVENT_NOT_AVAILABLE_AT_CUTOFF'/)
})

test('raw and simulated BUY arithmetic retain numeric precision while other actions stay observational', () => {
  const evaluator = sql.match(/create or replace function private\.evaluate_personal_return_checkpoint_v1[\s\S]+?\$\$;/)?.[0] ?? ''
  assert.match(evaluator, /v_price_return := \(v_exit_price \/ v_entry_price\) - 1/)
  assert.match(evaluator, /v_decision\.entry_fee_bps \/ 10000/)
  assert.match(evaluator, /v_decision\.entry_slippage_bps \/ 10000/)
  assert.match(evaluator, /v_decision\.exit_slippage_bps \/ 10000/)
  assert.match(evaluator, /v_decision\.exit_fee_bps \/ 10000/)
  assert.match(evaluator, /if v_decision\.action = 'BUY'/)
  assert.match(evaluator, /'OBSERVATIONAL_ONLY'/)
  assert.doesNotMatch(evaluator, /round\(/i)
})

test('missing FX, benchmark and corporate-action evidence stays explicit and null', () => {
  const evaluator = sql.match(/create or replace function private\.evaluate_personal_return_checkpoint_v1[\s\S]+?\$\$;/)?.[0] ?? ''
  assert.match(evaluator, /'UNVERIFIED_CORPORATE_ACTIONS'/)
  assert.match(evaluator, /'INCOMPLETE_FX'/)
  assert.match(evaluator, /'MISSING_EXACT_FX'/)
  assert.match(evaluator, /'MISSING_BENCHMARK'/)
  assert.match(evaluator, /v_price_return, null, v_base_return, null[\s\S]*null, v_net_return, null/)
})

test('checkpoint writes are service-only, immutable and idempotent with conflict denial', () => {
  const evaluator = sql.match(/create or replace function private\.evaluate_personal_return_checkpoint_v1[\s\S]+?\$\$;/)?.[0] ?? ''
  assert.match(evaluator, /encode\(extensions\.digest\(convert_to\(jsonb_build_object\(/)
  assert.match(evaluator, /'decision_source_hash', v_decision\.source_hash/)
  assert.match(evaluator, /on conflict \(decision_id, checkpoint_code, evaluation_cutoff, calculation_version\)[\s\S]*do nothing/)
  assert.match(evaluator, /v_result\.source_identity_hash <> v_source_hash/)
  assert.match(evaluator, /CALCULATION_ERROR: immutable checkpoint source conflict/)
  assert.match(sql, /revoke all on function private\.evaluate_personal_return_checkpoint_v1\(uuid, text, timestamptz\)[\s\S]*from public, anon, authenticated/)
  assert.match(sql, /grant execute on function private\.evaluate_personal_return_checkpoint_v1\(uuid, text, timestamptz\)[\s\S]*to service_role/)
})
