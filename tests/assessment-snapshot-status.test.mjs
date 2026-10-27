import assert from 'node:assert/strict'
import test from 'node:test'
import { describeAssessmentSnapshot } from '../lib/assessment-snapshot-status.mjs'

const now = Date.parse('2026-10-27T00:00:00Z') // 26 October in New York, 27 October in Perth.
const fixture = () => ({ assessment_id: 'ai-latest', instrument_id: 'stock', assessment_date: '2026-10-21',
  convergence: { instrument_id: 'stock', ai_assessment_id: 'ai-old', assessment_date: '2026-08-20' } })

test('older Convergence is not represented as a combination using the displayed AI record', () => {
  const value = describeAssessmentSnapshot(fixture(), now)
  assert.equal(value.source, 'different-ai')
  assert.equal(value.matchesDisplayedAI, false)
  assert.equal(value.sourceLabel, 'Historical — different AI assessment')
  assert.equal(value.ai.ageDays, 5)
  assert.equal(value.convergence.ageDays, 67)
})

test('matching dates alone cannot substitute for exact AI record lineage', () => {
  const row = fixture(); row.convergence.assessment_date = row.assessment_date
  assert.equal(describeAssessmentSnapshot(row, now).source, 'different-ai')
  row.convergence.ai_assessment_id = row.assessment_id
  const value = describeAssessmentSnapshot(row, now)
  assert.equal(value.source, 'matched')
  assert.equal(value.matchesDisplayedAI, true)
  assert.equal(value.ai.ageDays, 5) // A lineage match must not relabel old research as fresh.
})

test('a matching assessment ID cannot hide an instrument identity mismatch', () => {
  const row = fixture(); row.convergence.ai_assessment_id = row.assessment_id; row.convergence.instrument_id = 'other-stock'
  assert.equal(describeAssessmentSnapshot(row, now).source, 'unverified')
})

test('missing snapshots and missing IDs remain explicit and never count as matched', () => {
  assert.equal(describeAssessmentSnapshot({ ...fixture(), convergence: null }, now).source, 'missing')
  for (const ai_assessment_id of ['', null, undefined]) {
    const row = fixture(); row.convergence.ai_assessment_id = ai_assessment_id
    assert.equal(describeAssessmentSnapshot(row, now).matchesDisplayedAI, false)
  }
})

for (const invalid of ['not-a-date', '2026-02-30', '2026-10-21T00:00:00Z', null]) {
  test(`invalid date ${invalid} is not silently normalised into a verified snapshot`, () => {
    const row = fixture(); row.assessment_date = invalid; row.convergence.ai_assessment_id = row.assessment_id
    const value = describeAssessmentSnapshot(row, now)
    assert.equal(value.ai.ageDays, null)
    assert.equal(value.source, 'unverified')
  })
}

test('future-dated AI or Convergence records are not a verified source match', () => {
  for (const field of ['ai', 'convergence']) {
    const row = fixture(); row.convergence.ai_assessment_id = row.assessment_id
    if (field === 'ai') row.assessment_date = '2026-10-27'
    else row.convergence.assessment_date = '2026-10-27'
    const value = describeAssessmentSnapshot(row, now)
    assert.equal(value.source, 'unverified')
    assert.match(value[field].label, /Future date/)
  }
})

test('market age follows the New York calendar boundary rather than Perth or elapsed 24-hour periods', () => {
  const row = { ...fixture(), assessment_date: '2026-10-26', convergence: null }
  assert.equal(describeAssessmentSnapshot(row, '2026-10-27T00:00:00Z').ai.ageDays, 0)
  assert.equal(describeAssessmentSnapshot(row, '2026-10-27T04:00:00Z').ai.ageDays, 1)
  assert.equal(describeAssessmentSnapshot(row, '2026-10-27T04:00:00Z').ai.label, '1 calendar day old')
})

test('DST and weekends change the calendar age without manufacturing a trading-session verdict', () => {
  const row = { ...fixture(), assessment_date: '2026-10-30', convergence: null }
  for (const instant of ['2026-11-01T05:30:00Z', '2026-11-01T06:30:00Z']) {
    const value = describeAssessmentSnapshot(row, instant)
    assert.equal(value.ai.ageDays, 2)
    assert.equal(value.source, 'missing')
  }
  assert.equal(describeAssessmentSnapshot(row, 'invalid clock').ai.ageDays, null)
})
