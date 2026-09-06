import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const componentUrl = new URL('../components/MyDashboardClient.tsx', import.meta.url)
const stylesUrl = new URL('../components/MyDashboardClient.module.css', import.meta.url)

test('private CSV UI previews in memory and requires explicit confirmation', async () => {
  const component = await readFile(componentUrl, 'utf8')

  assert.match(component, /parseHoldingsCsv\(new Uint8Array\(await file\.arrayBuffer\(\)\)\)/)
  assert.match(component, /type="file" accept="\.csv,text\/csv"/)
  assert.match(component, /onDrop=\{\(event\) => \{ event\.preventDefault\(\); void previewCsvFile/)
  assert.match(component, /Previewing never writes; confirmation is atomic/)
  assert.match(component, /onClick=\{\(\) => void confirmCsvImport\(\)\}/)
  assert.match(component, /disabled=\{csvBusy \|\| csvPreview\.errors\.length > 0 \|\| csvPreview\.rows\.length === 0\}/)
})

test('private CSV UI resolves owner data and calls only the atomic RPC', async () => {
  const component = await readFile(componentUrl, 'utf8')

  assert.match(component, /permanentUser\(\(await getBrowserSupabase\(\)\.auth\.getUser\(\)\)\.data\.user\)/)
  assert.match(component, /portfolio\.status === 'active' && portfolio\.portfolio_kind === 'manual'/)
  assert.match(component, /instrument\.symbol\.toUpperCase\(\).*instrument\.exchange_code\.toUpperCase\(\)/s)
  assert.match(component, /expected_position_updated_at: row\.existing\?\.updated_at \?\? null/)
  assert.match(component, /supabase\.rpc\('import_portfolio_holdings_csv_v1'/)
  assert.doesNotMatch(component, /csv[\s\S]{0,300}\.from\('portfolio_positions'\)\.insert/i)
})

test('private CSV UI exposes accessible status, errors and narrow-screen overflow containment', async () => {
  const [component, styles] = await Promise.all([readFile(componentUrl, 'utf8'), readFile(stylesUrl, 'utf8')])

  assert.match(component, /aria-label="Choose holdings CSV"/)
  assert.match(component, /role="status" aria-live="polite"/)
  assert.match(component, /className=\{styles\.csvErrors\}/)
  assert.match(styles, /\.csvTableWrap\{overflow-x:auto\}/)
  assert.match(styles, /@media\(max-width:560px\)[\s\S]*\.csvActions button\{flex:1 1 100%\}/)
})
