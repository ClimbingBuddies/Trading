import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const migrationUrl = new URL('../supabase/migrations/20260905185500_my_dashboard_holdings_csv_import_v1.sql', import.meta.url)

test('CSV import RPC is narrowly granted and executes with caller RLS', async () => {
  const sql = await readFile(migrationUrl, 'utf8')

  assert.match(sql, /create function public\.import_portfolio_holdings_csv_v1\(\s*p_portfolio_id uuid,\s*p_preview_revision text,\s*p_rows jsonb\s*\)/)
  assert.match(sql, /security invoker/)
  assert.match(sql, /set search_path = ''/)
  assert.doesNotMatch(sql, /security definer|service_role/i)
  assert.match(sql, /revoke all on function public\.import_portfolio_holdings_csv_v1\(uuid, text, jsonb\)\s+from public, anon, authenticated/)
  assert.match(sql, /grant execute on function public\.import_portfolio_holdings_csv_v1\(uuid, text, jsonb\)\s+to authenticated/)
})

test('CSV import RPC rejects non-permanent callers and locks an owned active manual portfolio', async () => {
  const sql = await readFile(migrationUrl, 'utf8')

  assert.match(sql, /v_owner_id uuid := auth\.uid\(\)/)
  assert.match(sql, /auth\.jwt\(\)->>'is_anonymous'/)
  assert.match(sql, /message = 'PERMANENT_USER_REQUIRED'/)
  assert.match(sql, /p\.id = p_portfolio_id[\s\S]*p\.owner_user_id = v_owner_id[\s\S]*p\.status = 'active'[\s\S]*p\.portfolio_kind = 'manual'[\s\S]*for update/)
  assert.match(sql, /message = 'PORTFOLIO_NOT_IMPORTABLE'/)
})

test('CSV import RPC revalidates shape, instruments, duplicates and preview freshness before writes', async () => {
  const sql = await readFile(migrationUrl, 'utf8')
  const validationEnd = sql.indexOf('for v_row in select value from jsonb_array_elements(v_resolved_rows)')
  const firstWrite = sql.indexOf('insert into public.portfolio_positions')

  assert.match(sql, /jsonb_array_length\(p_rows\) not between 1 and 1000/)
  assert.match(sql, /jsonb_object_keys\(v_row\)/)
  assert.match(sql, /key not in \([\s\S]*'expected_position_updated_at'/)
  assert.match(sql, /from public\.instruments i[\s\S]*i\.symbol = v_row->>'symbol'[\s\S]*i\.exchange_code = v_row->>'exchange_code'[\s\S]*i\.is_active = true/)
  assert.match(sql, /message = 'PREVIEW_STALE'/)
  assert.match(sql, /message = 'DUPLICATE_IN_FILE'/)
  assert.ok(validationEnd > 0 && firstWrite > validationEnd, 'all rows must validate before the first position write')
})

test('CSV import RPC writes only canonical manual fields and detects write races', async () => {
  const sql = await readFile(migrationUrl, 'utf8')

  assert.match(sql, /insert into public\.portfolio_positions \(\s*owner_user_id, portfolio_id, instrument_id, quantity, average_cost_per_unit,\s*cost_currency, acquired_at, position_source, source_decision_id, notes/)
  assert.match(sql, /'manual',\s*null,/)
  assert.match(sql, /update public\.portfolio_positions pp set[\s\S]*pp\.owner_user_id = v_owner_id[\s\S]*pp\.updated_at = \(v_row->>'expected_position_updated_at'\)::timestamptz/)
  assert.match(sql, /on conflict \(portfolio_id, instrument_id\) do nothing/)
  assert.ok((sql.match(/if not found then\s+raise exception using errcode = '40001', message = 'PREVIEW_STALE'/g) ?? []).length >= 2)
  assert.match(sql, /returns table\(inserted_count integer, updated_count integer, position_ids uuid\[\]\)/)
  assert.doesNotMatch(sql, /delete from public\.portfolio_positions/i)
})
