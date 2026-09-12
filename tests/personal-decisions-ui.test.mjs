import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
const ui = await readFile(new URL('../components/PredictionWorkspace.tsx', import.meta.url), 'utf8')
test('Decision Lab uses the same published prediction ledger and owner-scoped outcomes', () => {
  assert.match(ui, /from\('personal_prediction_plans'\)/)
  assert.match(ui, /from\('personal_prediction_results'\)/)
  assert.match(ui, /eq\('owner_user_id', ownerId\)/)
  assert.match(ui, /offset \+= 500/)
  assert.doesNotMatch(ui, /capture_personal_decision|Capture AI signal/)
})
test('Decision Lab withholds unfinished returns and retains source clocks', () => {
  assert.match(ui, /result\?\.status === 'COMPLETE'/)
  assert.match(ui, /p\.published_at/)
  assert.match(ui, /p\.source_cutoff/)
  assert.match(ui, /Observation only/)
  assert.match(ui, /No orders are placed/)
})

