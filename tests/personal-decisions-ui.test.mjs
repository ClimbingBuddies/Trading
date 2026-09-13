import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
const ui = await readFile(new URL('../components/PredictionWorkspace.tsx', import.meta.url), 'utf8')
test('Decision Lab retains all owner-scoped original, update and outcome pages', () => {
  for (const table of ['personal_prediction_plans','personal_prediction_results','personal_decision_events','personal_decision_outcomes']) assert.ok(ui.includes(table))
  assert.match(ui, /eq\('owner_user_id',\s*ownerId\)/)
  assert.match(ui, /offset\s*\+=\s*500/)
  assert.doesNotMatch(ui, /capture_personal_decision|Capture AI signal/)
})
test('Decision Lab exposes original clocks and distinguishes provisional from final outcomes', () => {
  assert.match(ui, /row\.plan\.published_at/)
  assert.match(ui, /row\.plan\.source_cutoff/)
  assert.match(ui, /Provisional/)
  assert.match(ui, /Final/)
  assert.match(ui, /not a trade execution/)
})
