import assert from 'node:assert/strict'
import test from 'node:test'
import { matchingPlan, olderAssessment, ratingAction } from '../lib/watchlist-recommendations.mjs'

test('Research cannot inherit a different assessment, share or horizon plan', () => {
  const base = { id: 'p1', instrument_id: 'a', assessment_id: 'old', horizon_sessions: 5, published_at: '2026-09-10T00:00:00Z' }
  const plans = [base, { ...base, id: 'p2', assessment_id: 'new', horizon_sessions: 20 }, { ...base, id: 'p3', instrument_id: 'b', assessment_id: 'new' }]
  assert.equal(matchingPlan(plans, 'a', 'new', 5), null)
  assert.equal(matchingPlan(plans, 'a', undefined, 5), null)
  assert.equal(matchingPlan(plans, 'a', 'new', 20)?.id, 'p2')
  assert.equal(matchingPlan(plans, 'a', 'old', 5)?.id, 'p1')
})

test('Unrecognised or missing research never becomes a buy candidate', () => {
  assert.equal(ratingAction('Strong Buy'), 'BUY')
  assert.equal(ratingAction('Hold'), 'HOLD')
  assert.equal(ratingAction('Strong Sell'), 'AVOID')
  for (const value of [null, undefined, '', 'Buy if price recovers']) assert.equal(ratingAction(value), 'UNKNOWN')
})

test('Outdated or invalid research is distinguished from recent research', () => {
  const now = Date.parse('2026-09-13T12:00:00Z')
  assert.equal(olderAssessment('2026-09-12T12:00:00Z', now), false)
  assert.equal(olderAssessment('2026-09-09T12:00:00Z', now), true)
  assert.equal(olderAssessment('2026-09-14T12:00:00Z', now), true)
  assert.equal(olderAssessment(undefined, now), true)
})

test('AI timing renders the published choices and keeps legacy timing distinct', async () => {
  const { timingText } = await import('../lib/watchlist-recommendations.mjs')
  const plan = { action: 'BUY', entry_rule: 'AI_SESSION_OFFSET', entry_delay_sessions: 3, holding_sessions: 2, horizon_sessions: 5 }
  assert.deepEqual(timingText(plan), { buy: 'Session 3 close after publication', sell: 'Close 2 sessions after entry' })
  assert.equal(timingText({ ...plan, action: 'HOLD' }).buy, 'No entry planned')
  assert.equal(timingText({ ...plan, entry_rule: 'NEXT_COMPLETE_DAILY_CLOSE', holding_sessions: null }).sell, 'Close 5 sessions after entry')
  assert.equal(timingText({ ...plan, holding_sessions: null }).sell, 'Timing unavailable')
})