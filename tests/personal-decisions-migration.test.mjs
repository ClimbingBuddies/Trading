import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const migrationUrl = new URL('../supabase/migrations/20260906120500_my_dashboard_decision_capture_v1.sql', import.meta.url)
const sql = await readFile(migrationUrl, 'utf8')

test('decision records are immutable, owner scoped, and browser read only', () => {
  for (const table of ['personal_decisions', 'personal_decision_events']) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`))
    assert.match(sql, new RegExp(`revoke all on table public\\.${table} from public, anon, authenticated`))
    assert.match(sql, new RegExp(`grant select on table public\\.${table} to authenticated`))
    assert.doesNotMatch(sql, new RegExp(`grant (insert|update|delete|all) on table public\\.${table} to authenticated`))
  }
  assert.match(sql, /before update or delete on public\.personal_decisions/)
  assert.match(sql, /before update or delete on public\.personal_decision_events/)
  assert.match(sql, /owner_user_id = \(select auth\.uid\(\)\)/)
  assert.match(sql, /is_anonymous/)
  assert.match(sql, /foreign key \(decision_id, owner_user_id\)[\s\S]*references public\.personal_decisions\(id, owner_user_id\)/)
})

test('AI and user-paper capture keep distinct trusted clocks and snapshots', () => {
  const capture = sql.match(/create or replace function public\.capture_personal_decision_v1[\s\S]+?\$\$;/)?.[0] ?? ''
  assert.match(capture, /security definer/)
  assert.match(capture, /v_owner uuid := auth\.uid\(\)/)
  assert.match(capture, /r\.analysis_cutoff_time/)
  assert.match(capture, /r\.status = 'succeeded'/)
  assert.match(capture, /a\.technical_engine_input_used is false/)
  assert.match(capture, /v_decision_at := v_source_cutoff/)
  assert.match(capture, /v_source_cutoff := v_now;[\s\S]*v_decision_at := v_now/)
  assert.match(capture, /AI signal inputs must come only from the persisted assessment/)
  assert.match(capture, /jsonb_build_object\([\s\S]*'analysis_cutoff_time'/)
  assert.match(capture, /extensions\.digest\(convert_to\(v_source_snapshot::text, 'UTF8'\), 'sha256'\)/)
  assert.doesNotMatch(capture, /p_(owner|decision_at|source_cutoff|source_snapshot)/)
})

test('capture preserves the approved no-trade simulation boundary', () => {
  const decisionsTable = sql.match(/create table public\.personal_decisions \([\s\S]+?\n\);/)?.[0] ?? ''
  assert.match(sql, /entry_rule text not null default 'NEXT_DAILY_CLOSE'/)
  assert.match(sql, /calculation_version text not null default 'personal-forward-return-v1'/)
  assert.match(sql, /action in \('BUY', 'WATCH', 'HOLD', 'PASS', 'AVOID'\)/)
  assert.match(sql, /benchmark_mode not in \('NONE', 'OWNER_SELECTED'\)/)
  assert.doesNotMatch(decisionsTable, /broker|order_id|account_number|api_key/i)
  assert.match(sql, /No broker or execution authority/)
})

test('terminal decision events are append only and singular', () => {
  assert.match(sql, /create unique index personal_decision_events_one_terminal_idx[\s\S]*where event_type in \('EXIT', 'CANCEL'\)/)
  const append = sql.match(/create or replace function public\.append_personal_decision_event_v1[\s\S]+?\$\$;/)?.[0] ?? ''
  assert.match(append, /d\.owner_user_id = v_owner/)
  assert.match(append, /Decision already has a terminal event/)
  assert.match(sql, /event_at timestamptz not null default clock_timestamp\(\)/)
  assert.doesNotMatch(append, /p_event_at|event_at\)/)
  assert.doesNotMatch(append, /update public\.personal_decisions|delete from public\.personal_decisions/)
  assert.match(sql, /grant execute on function public\.append_personal_decision_event_v1\(uuid, text, jsonb\) to authenticated/)
  assert.match(sql, /revoke all on function public\.append_personal_decision_event_v1\(uuid, text, jsonb\) from public, anon/)
})

test('paper positions can reference only a same-owner immutable decision', () => {
  assert.match(sql, /foreign key \(source_decision_id, owner_user_id\)[\s\S]*references public\.personal_decisions\(id, owner_user_id\)[\s\S]*on delete restrict/)
})
