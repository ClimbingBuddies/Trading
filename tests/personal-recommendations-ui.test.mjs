import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
const ui = await readFile(new URL('../components/PredictionWorkspace.tsx', import.meta.url), 'utf8')
test('Recommendations presents fixed published buy/sell rules and preserves all records', () => {
  for (const label of ['When to buy','When to sell','Why this share','Risks and original evidence','Weekly · 5 sessions','Monthly · 20 sessions']) assert.ok(ui.includes(label))
  assert.doesNotMatch(ui, /latestEvent|dismiss|\.delete\(|\.update\(/)
  assert.match(ui, /not AI forecasts/)
})
test('Tracking starts for the authenticated owner, without accepting a user ID argument', () => {
  assert.match(ui, /rpc\('start_personal_prediction_tracking_v1'\)/)
  assert.match(ui, /role="alert"/)
  assert.match(ui, /role="status"/)
  assert.match(ui, /Waiting for the next fresh assessment/)
  assert.match(ui, /signal\.aborted/)
})

