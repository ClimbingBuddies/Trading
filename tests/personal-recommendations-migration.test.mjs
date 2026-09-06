import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const migrationUrl = new URL('../supabase/migrations/20260906093000_my_dashboard_recommendations_v1.sql', import.meta.url)

test('recommendation snapshots and sources preserve immutable identity and chronology', async () => {
  const sql = await readFile(migrationUrl, 'utf8')
  const snapshot = sql.match(/create table public\.personal_recommendation_snapshots \([\s\S]*?\n\);/)?.[0]
  assert.ok(snapshot)
  assert.match(snapshot, /source_cutoff timestamptz not null/)
  assert.match(snapshot, /constraint personal_recommendation_cutoff_check check \(source_cutoff <= generated_at\)/)
  assert.match(snapshot, /unique \(owner_user_id, instrument_id, generated_at, methodology_version\)/)
  assert.doesNotMatch(snapshot, /updated_at/)
  assert.match(sql, /foreign key \(recommendation_id, owner_user_id\)[\s\S]*references public\.personal_recommendation_snapshots\(id, owner_user_id\)/g)
  for (const table of ['snapshots', 'sources', 'events']) {
    assert.match(sql, new RegExp(`create trigger personal_recommendation_${table}_immutable[\\s\\S]*before update or delete on public\\.personal_recommendation_${table}`))
  }
  assert.match(sql, /raise exception 'Personal recommendation records are append-only\.'/)
  assert.match(sql, /revoke all on function public\.reject_personal_recommendation_mutation_v1\(\) from public, anon, authenticated/)
})

test('browser access is select-only while feedback uses one constrained append RPC', async () => {
  const sql = await readFile(migrationUrl, 'utf8')
  for (const table of ['personal_recommendation_snapshots', 'personal_recommendation_sources', 'personal_recommendation_events']) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`))
    assert.match(sql, new RegExp(`revoke all on table public\\.${table} from public, anon, authenticated`))
    assert.match(sql, new RegExp(`grant select on table public\\.${table} to authenticated`))
    assert.doesNotMatch(sql, new RegExp(`grant [^;]*(insert|update|delete)[^;]* on table public\\.${table} to authenticated`))
  }
  assert.match(sql, /p_event_type not in \('watch', 'dismiss', 'feedback'\)/)
  assert.match(sql, /where s\.id = p_recommendation_id and s\.owner_user_id = v_owner_id/)
  assert.match(sql, /revoke all on function public\.append_personal_recommendation_event_v1\(uuid, text, text, text\) from public, anon/)
  assert.match(sql, /grant execute on function public\.append_personal_recommendation_event_v1\(uuid, text, text, text\) to authenticated/)
})

test('recommendation categories cannot encode Buy or Sell and evidence families stay explicit', async () => {
  const sql = await readFile(migrationUrl, 'utf8')
  assert.match(sql, /category in \('INVESTIGATE', 'MONITOR', 'REVIEW_RISK', 'THEME_EXPOSURE'\)/)
  assert.doesNotMatch(sql, /category in \([^)]*'BUY'/)
  assert.doesNotMatch(sql, /category in \([^)]*'SELL'/)
  assert.match(sql, /source_family in \('MARKET_AI', 'TECHNICAL', 'OPPORTUNITY', 'EXTERNAL_FACT'\)/)
  assert.match(sql, /principal_risks text not null/)
  assert.match(sql, /quality_reasons text\[\] not null default '\{\}'/)
})

test('anonymous and cross-owner recommendation reads are denied by policy predicates', async () => {
  const sql = await readFile(migrationUrl, 'utf8')
  const policies = [...sql.matchAll(/create policy personal_recommendation_[\s\S]*?;/g)]
  assert.equal(policies.length, 3)
  for (const [statement] of policies) {
    assert.match(statement, /\(select auth\.uid\(\)\) is not null/)
    assert.match(statement, /\(select auth\.jwt\(\)\)/)
    assert.match(statement, /owner_user_id = \(select auth\.uid\(\)\)/)
  }
})

test('trusted writer is atomic, service-only and verifies immutable conflicts', async () => {
  const sql = await readFile(migrationUrl, 'utf8')
  assert.match(sql, /create or replace function private\.persist_personal_recommendation_v1\(/)
  assert.match(sql, /security definer\s+set search_path = pg_catalog/)
  assert.match(sql, /on conflict \(owner_user_id, instrument_id, generated_at, methodology_version\) do nothing/)
  assert.match(sql, /for update/)
  assert.match(sql, /Immutable recommendation conflict: persisted source identity differs\./)
  assert.match(sql, /revoke all on function private\.persist_personal_recommendation_v1\(jsonb, jsonb\) from public, anon, authenticated/)
  assert.match(sql, /grant execute on function private\.persist_personal_recommendation_v1\(jsonb, jsonb\) to service_role/)
  assert.match(sql, /dependency_key text not null/)
  assert.match(sql, /qualifies_positive boolean not null/)
})
