import test from 'node:test'
import assert from 'node:assert/strict'
import { buildRecommendationCandidate, createSupabaseRecommendationSourceStore, immutableRecommendationMatches, loadOwnerRecommendationContext, persistRecommendationCandidate, persistRecommendationWithRpc } from '../lib/personal-recommendations.mjs'

const base = {
  ownerId: 'owner-a', instrumentId: 'instrument-a', generatedAt: '2026-09-06T00:00:00.000Z',
  category: 'INVESTIGATE', horizonSessions: 20, thesis: 'Independent evidence supports deeper research.',
  principalRisks: 'The evidence may weaken and missing data remains material.', confidence: 0.7,
  relevanceReasons: ['WATCHLIST:list-a'],
  sources: [
    { family: 'MARKET_AI', table: 'gpt_market_assessments', recordKey: 'ai-1', cutoff: '2026-09-05T00:00:00.000Z', methodologyVersion: 'market-v1', relevance: 'Current independent Market assessment.', status: 'COMPLETE', positive: true, calendarAvailable: true, missedSessions: 1, dependencyIds: ['ai-1'] },
    { family: 'TECHNICAL', table: 'market_scores', recordKey: 'tech-1', cutoff: '2026-09-05T00:00:00.000Z', methodologyVersion: 'technical-v1', relevance: 'Current independent Technical score.', status: 'COMPLETE', positive: true, calendarAvailable: true, missedSessions: 1, dependencyIds: ['tech-1'] },
  ],
}

test('builds a deterministic canonical candidate independent of source and relevance order', async () => {
  const first = await buildRecommendationCandidate(base)
  const second = await buildRecommendationCandidate({ ...base, relevanceReasons: [...base.relevanceReasons].reverse(), sources: [...base.sources].reverse() })
  assert.equal(first.source_hash, second.source_hash)
  assert.equal(first.quality_status, 'COMPLETE')
  assert.equal(first.source_cutoff, '2026-09-05T00:00:00.000Z')
})

test('denies Opportunity-only INVESTIGATE and one-indicator paths', async () => {
  const opportunity = { family: 'OPPORTUNITY', table: 'opportunity_assessments', recordKey: 'opp-1', cutoff: '2026-09-01T00:00:00.000Z', methodologyVersion: 'opp-v1', relevance: 'Relevant theme.', status: 'COMPLETE', positive: true }
  await assert.rejects(buildRecommendationCandidate({ ...base, sources: [opportunity] }), /insufficient independent/)
  const indicator = { ...base.sources[1], table: 'technical_indicators', recordKey: 'indicator-1', dependencyIds: ['indicator-1'] }
  await assert.rejects(buildRecommendationCandidate({ ...base, sources: [indicator] }), /insufficient independent/)
})

test('collapses reused convergence dependencies', async () => {
  const reused = { ...base.sources[1], recordKey: 'convergence-1', table: 'market_convergence_assessments', dependencyIds: ['ai-1'] }
  await assert.rejects(buildRecommendationCandidate({ ...base, sources: [base.sources[0], reused] }), /insufficient independent/)
})

test('failed, partial, stale and calendar-unknown sources cannot qualify positively', async () => {
  for (const source of [
    { ...base.sources[1], status: 'FAILED' },
    { ...base.sources[1], status: 'PARTIAL' },
    { ...base.sources[1], missedSessions: 6 },
    { ...base.sources[1], calendarAvailable: false },
  ]) await assert.rejects(buildRecommendationCandidate({ ...base, sources: [base.sources[0], source] }), /insufficient independent/)
})

test('MONITOR permits one qualifying group only with an explicit limitation', async () => {
  const candidate = await buildRecommendationCandidate({ ...base, category: 'MONITOR', sources: [base.sources[0]] })
  assert.equal(candidate.quality_status, 'LIMITED')
  assert.deepEqual(candidate.quality_reasons, ['SINGLE_DEPENDENCY_GROUP'])
})

test('requires personal relevance and rejects future cutoffs', async () => {
  await assert.rejects(buildRecommendationCandidate({ ...base, relevanceReasons: ['PUBLIC_MARKET:all'] }), /Personal relevance/)
  await assert.rejects(buildRecommendationCandidate({ ...base, sources: [{ ...base.sources[0], cutoff: '2026-09-07T00:00:00.000Z' }] }), /later than generated/)
})

test('immutable conflict comparison accepts identical writes and rejects divergent evidence', async () => {
  const candidate = await buildRecommendationCandidate(base)
  const { sources, ...snapshot } = candidate
  assert.equal(immutableRecommendationMatches(candidate, snapshot, sources), true)
  assert.equal(immutableRecommendationMatches(candidate, { ...snapshot, thesis: 'changed' }, sources), false)
  assert.equal(immutableRecommendationMatches(candidate, snapshot, [{ ...sources[0], source_record_key: 'changed' }, ...sources.slice(1)]), false)
})

test('persistence requires an atomic trusted adapter and treats identical conflicts as idempotent', async () => {
  const candidate = await buildRecommendationCandidate(base)
  const { sources, ...snapshot } = candidate
  const store = { runAtomically: async (operation) => operation({
    insertSnapshotOnConflictDoNothing: async () => ({ inserted: false }),
    insertSources: async () => assert.fail('sources must not be reinserted on conflict'),
    loadSnapshotAndSources: async () => ({ snapshot: { id: 'existing-id', ...snapshot }, sources }),
  }) }
  assert.deepEqual(await persistRecommendationCandidate(store, candidate), { id: 'existing-id', inserted: false })
  await assert.rejects(persistRecommendationCandidate({ runAtomically: async (operation) => operation({
    insertSnapshotOnConflictDoNothing: async () => ({ inserted: false }),
    loadSnapshotAndSources: async () => ({ snapshot: { id: 'existing-id', ...snapshot, thesis: 'different' }, sources }),
  }) }, candidate), /persisted source identity differs/)
})

test('trusted source loading requires owner-filtered relevance and rejects future evidence', async () => {
  const store = {
    loadPersonalRelevance: async ({ ownerId }) => [{ owner_user_id: ownerId, reason: 'WATCHLIST:list-a' }],
    loadEligibleEvidence: async () => base.sources,
  }
  assert.deepEqual(await loadOwnerRecommendationContext(store, 'owner-a', 'instrument-a', base.generatedAt), {
    relevanceReasons: ['WATCHLIST:list-a'], sources: base.sources,
  })
  await assert.rejects(loadOwnerRecommendationContext({ ...store, loadPersonalRelevance: async () => [{ owner_user_id: 'owner-b', reason: 'WATCHLIST:list-b' }] }, 'owner-a', 'instrument-a', base.generatedAt), /Owner-filtered/)
  await assert.rejects(loadOwnerRecommendationContext({ ...store, loadEligibleEvidence: async () => [{ ...base.sources[0], cutoff: '2026-09-07T00:00:00.000Z' }] }, 'owner-a', 'instrument-a', base.generatedAt), /future or invalid/)
})

test('trusted RPC adapter sends canonical snapshot and sources separately', async () => {
  const candidate = await buildRecommendationCandidate(base)
  let request
  const id = await persistRecommendationWithRpc({ schema: (name) => { assert.equal(name, 'private'); return { rpc: async (rpcName, args) => { request = { name: rpcName, args }; return { data: 'snapshot-id', error: null } } } } }, candidate)
  assert.equal(id, 'snapshot-id')
  assert.equal(request.name, 'persist_personal_recommendation_v1')
  assert.equal(request.args.p_snapshot.source_hash, candidate.source_hash)
  assert.equal(request.args.p_snapshot.sources, undefined)
  assert.deepEqual(request.args.p_sources, candidate.sources)
})

test('concrete Supabase source store calls the private owner/cutoff RPC once', async () => {
  const calls = []
  const store = createSupabaseRecommendationSourceStore({ schema: (name) => {
    assert.equal(name, 'private')
    return { rpc: async (rpcName, args) => {
      calls.push({ rpcName, args })
      return { data: { relevance: [{ owner_user_id: 'owner-a', reason: 'WATCHLIST:list-a' }], evidence: base.sources }, error: null }
    } }
  } })
  assert.deepEqual(await loadOwnerRecommendationContext(store, 'owner-a', 'instrument-a', base.generatedAt), {
    relevanceReasons: ['WATCHLIST:list-a'], sources: base.sources,
  })
  assert.deepEqual(calls, [{ rpcName: 'load_personal_recommendation_context_v1', args: {
    p_owner_user_id: 'owner-a', p_instrument_id: 'instrument-a', p_cutoff: base.generatedAt,
  } }])
})

test('concrete loader output feeds the generator and fails closed for unavailable, stale and future session evidence', async () => {
  const loadAndBuild = async (evidence) => {
    const store = createSupabaseRecommendationSourceStore({ schema: () => ({ rpc: async () => ({
      data: { relevance: [{ owner_user_id: 'owner-a', reason: 'WATCHLIST:list-a' }], evidence }, error: null,
    }) }) })
    const context = await loadOwnerRecommendationContext(store, 'owner-a', 'instrument-a', base.generatedAt)
    return buildRecommendationCandidate({ ...base, ...context })
  }

  const eligible = await loadAndBuild(base.sources)
  assert.equal(eligible.quality_status, 'COMPLETE')
  await assert.rejects(loadAndBuild([base.sources[0], { ...base.sources[1], calendarAvailable: false, missedSessions: null }]), /insufficient independent/)
  await assert.rejects(loadAndBuild([base.sources[0], { ...base.sources[1], missedSessions: 6 }]), /insufficient independent/)
  await assert.rejects(loadAndBuild([{ ...base.sources[0], cutoff: '2026-09-07T00:00:00.000Z' }, base.sources[1]]), /future or invalid/)
})
