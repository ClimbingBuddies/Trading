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
  const ledger = sql.match(/create table public\.personal_return_snapshots \([\s\S]+?\n\);/)?.[0] ?? ''
  assert.match(sql, /entry_observation_id bigint references public\.market_observations\(id\)/)
  assert.match(sql, /exit_observation_id bigint references public\.market_observations\(id\)/)
  assert.match(sql, /source_identity_hash text not null/)
  assert.match(sql, /source_identity_hash ~ '\^\[0-9a-f\]\{64\}\$'/)
  assert.match(sql, /calculation_version = 'personal-forward-return-v1'/)
  assert.doesNotMatch(ledger, /default 0[^-9]|coalesce\([^\n]*(price_return|benchmark_return|base_currency_return)/i)
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
  assert.match(evaluator, /v_price_return, null, v_base_return, v_benchmark_return/)
})

test('base-currency conversion uses only exact canonical direct or inverse FX rows', () => {
  const evaluator = sql.match(/create or replace function private\.evaluate_personal_return_checkpoint_v1[\s\S]+?\$\$;/)?.[0] ?? ''
  assert.match(evaluator, /i\.asset_type = 'forex'/)
  assert.match(evaluator, /upper\(btrim\(v_decision\.instrument_currency\) \|\| '\/' \|\| btrim\(v_decision\.base_currency\)\)/)
  assert.match(evaluator, /upper\(btrim\(v_decision\.base_currency\) \|\| '\/' \|\| btrim\(v_decision\.instrument_currency\)\)/)
  assert.match(evaluator, /mo\.observed_at = v_entry_at/)
  assert.match(evaluator, /mo\.observed_at = v_exit_at/)
  assert.match(evaluator, /else 1 \/ mo\.close/)
  assert.match(evaluator, /v_base_return := \(\(v_exit_price \* v_exit_fx_rate\) \/ \(v_entry_price \* v_entry_fx_rate\)\) - 1/)
  assert.match(evaluator, /'AMBIGUOUS_EXACT_FX'/)
  assert.match(evaluator, /'MISSING_EXACT_FX'/)
  assert.doesNotMatch(evaluator, /nearest|carry.forward|date_trunc/i)
})

test('optional benchmark requires exact entry and checkpoint sessions with no inferred default', () => {
  const evaluator = sql.match(/create or replace function private\.evaluate_personal_return_checkpoint_v1[\s\S]+?\$\$;/)?.[0] ?? ''
  assert.match(evaluator, /v_decision\.benchmark_mode <> 'NONE'/)
  assert.match(evaluator, /pi\.instrument_id = v_decision\.benchmark_instrument_id/)
  assert.match(evaluator, /mo\.observed_at = v_entry_at/)
  assert.match(evaluator, /mo\.observed_at = v_exit_at/)
  assert.match(evaluator, /v_benchmark_return := \(v_benchmark_exit_price \/ v_benchmark_entry_price\) - 1/)
  assert.match(evaluator, /v_excess_return := v_price_return - v_benchmark_return/)
  assert.match(evaluator, /'MISSING_BENCHMARK'/)
  assert.doesNotMatch(evaluator, /QQQ|asset_type.*benchmark|benchmark.*coalesce/i)
})

test('maximum drawdown is deterministic over the bounded raw-close valuation path', () => {
  const evaluator = sql.match(/create or replace function private\.evaluate_personal_return_checkpoint_v1[\s\S]+?\$\$;/)?.[0] ?? ''
  assert.match(evaluator, /mo\.observed_at between v_entry_at and v_exit_at/)
  assert.match(evaluator, /max\(mo\.close\) over \(order by mo\.observed_at rows between unbounded preceding and current row\)/)
  assert.match(evaluator, /min\(\(vp\.close \/ vp\.running_peak\) - 1\)/)
  assert.match(evaluator, /'INVALID_DRAWDOWN_CLOSE'/)
  assert.doesNotMatch(evaluator, /abs\(|round\(/i)
})

test('FX benchmark and drawdown evidence is persisted and bound into source identity', () => {
  const evaluator = sql.match(/create or replace function private\.evaluate_personal_return_checkpoint_v1[\s\S]+?\$\$;/)?.[0] ?? ''
  for (const field of [
    'entry_fx_observation_id', 'exit_fx_observation_id',
    'benchmark_entry_observation_id', 'benchmark_exit_observation_id', 'maximum_drawdown',
  ]) {
    assert.match(evaluator, new RegExp(`'${field}', v_`))
  }
  assert.match(evaluator, /v_entry_fx_id, v_exit_fx_id, v_entry_fx_rate, v_exit_fx_rate/)
  assert.match(evaluator, /v_benchmark_entry_id, v_benchmark_exit_id/)
  assert.match(evaluator, /v_base_return, v_benchmark_return[\s\S]*v_excess_return, v_net_return, v_maximum_drawdown/)
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

test('operational evaluator keeps run and per-checkpoint telemetry internal', () => {
  assert.match(sql, /create table private\.personal_return_evaluator_runs/)
  assert.match(sql, /create table private\.personal_return_evaluator_results/)
  assert.match(sql, /revoke all on table private\.personal_return_evaluator_runs from public, anon, authenticated/)
  assert.match(sql, /revoke all on table private\.personal_return_evaluator_results from public, anon, authenticated/)
  assert.match(sql, /grant select, insert, update on table private\.personal_return_evaluator_runs to service_role/)
  assert.doesNotMatch(sql, /grant .*personal_return_evaluator_(runs|results).*authenticated/i)
})

test('batch evaluation is cutoff-bound, targeted when requested and retryable', () => {
  const runner = sql.match(/create or replace function private\.run_personal_return_evaluator_v1[\s\S]+?\$\$;/)?.[0] ?? ''
  assert.match(runner, /p_evaluation_cutoff > statement_timestamp\(\)/)
  assert.match(runner, /d\.decision_at <= p_evaluation_cutoff/)
  assert.match(runner, /p_decision_id is null or d\.id = p_decision_id/)
  assert.match(runner, /attempt_count = attempt_count \+ 1/)
  assert.match(runner, /v_run\.status = 'succeeded'[\s\S]*return v_run/)
  assert.match(runner, /pg_advisory_xact_lock\(pg_catalog\.hashtextextended\(/)
  assert.match(sql, /target_decision_id\s*\n\s*\) nulls not distinct/)
})

test('batch evaluation selects only OPEN, configured horizon and eligible EXIT', () => {
  const runner = sql.match(/create or replace function private\.run_personal_return_evaluator_v1[\s\S]+?\$\$;/)?.[0] ?? ''
  assert.match(runner, /'OPEN',[\s\S]*v_decision\.horizon_sessions::text \|\| 'D'/)
  assert.match(runner, /e\.event_type = 'EXIT'/)
  assert.match(runner, /e\.event_at <= p_evaluation_cutoff/)
  assert.match(runner, /case when v_decision\.has_exit then 'EXIT' else null end/)
  assert.doesNotMatch(runner, /'5D',\s*'20D',\s*'60D'/)
})

test('batch failures are isolated and persisted without fabricating snapshots', () => {
  const runner = sql.match(/create or replace function private\.run_personal_return_evaluator_v1[\s\S]+?\$\$;/)?.[0] ?? ''
  assert.match(runner, /exception when others/)
  assert.match(runner, /left\(sqlstate \|\| ': ' \|\| sqlerrm, 1000\)/)
  assert.match(runner, /'failed', 'CALCULATION_ERROR', v_error/)
  assert.match(runner, /checkpoints_failed = v_failed/)
  assert.match(runner, /case when v_failed = 0 then 'succeeded' else 'failed' end/)
})

test('operational path remains service-only and installs no schedule or trading path', () => {
  assert.match(sql, /revoke all on function private\.run_personal_return_evaluator_v1\(text, timestamptz, uuid\)[\s\S]*from public, anon, authenticated/)
  assert.match(sql, /grant execute on function private\.run_personal_return_evaluator_v1\(text, timestamptz, uuid\)[\s\S]*to service_role/)
  const operational = sql.match(/create table private\.personal_return_evaluator_runs[\s\S]+?grant execute on function private\.run_personal_return_evaluator_v1\(text, timestamptz, uuid\)[\s\S]+?to service_role;/)?.[0] ?? ''
  assert.doesNotMatch(operational, /cron\.schedule|pg_net|http_post|broker|place_order|order_id/i)
})
