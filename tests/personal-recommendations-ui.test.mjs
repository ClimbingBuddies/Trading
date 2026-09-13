import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
const ui = await readFile(new URL('../components/PredictionWorkspace.tsx', import.meta.url), 'utf8')
test('Decision history preserves original records and adds clearly labelled personal notes', () => {
  for (const label of ['Original call','Latest AI view','Dated updates','1-week checkpoint','1-month checkpoint','Add my decision / note']) assert.ok(ui.includes(label))
  assert.doesNotMatch(ui, /\.delete\(|\.update\(/)
  assert.match(ui, /Personal notes never change the AI score/)
})
test('Tracking starts for the authenticated owner, without accepting a user ID argument', () => {
  assert.match(ui, /rpc\('start_personal_prediction_tracking_v1'\)/)
  assert.match(ui, /role="alert"/)
  assert.match(ui, /role="status"/)
  assert.match(ui, /Fresh assessments and daily prices are required/)
  assert.match(ui, /signal\.aborted/)
})
