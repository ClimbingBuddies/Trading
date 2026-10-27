import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import * as jsxRuntime from 'react/jsx-runtime'
import ts from 'typescript'

const source = fs.readFileSync(new URL('../components/OpportunityCarousel.tsx', import.meta.url), 'utf8')
const exports = {}
const styles = new Proxy({}, { get: (_, key) => String(key) })
vm.runInNewContext(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
}).outputText, {
  exports,
  require(name) {
    if (name === 'react/jsx-runtime') return jsxRuntime
    if (name === 'next/navigation') return { useRouter: () => ({ push() {} }) }
    if (name === 'next/link') return { default: ({ children, ...props }) => React.createElement('a', props, children) }
    if (name.endsWith('.css')) return { default: styles }
    throw new Error('Unexpected component dependency: ' + name)
  },
})

function render(delta, latestRunIsToday, updatedInLatestRun = true) {
  return renderToStaticMarkup(exports.default({
    rows: [{ theme: { id: 'theme', theme_code: 'test', theme_name: 'Test opportunity', status: 'watch', description: 'Research fixture' }, latest: { opportunity_score: 40, opportunity_level: 'watch' }, exposures: [] }],
    dailyByTheme: { theme: { scoreDelta: delta, updatedInLatestRun, scoreChanged: delta !== 0, evidenceRefreshed: true, newEventCount: 0 } },
    latestRunIsToday,
  }))
}

for (const [delta, expected] of [[0.5, '▲ +0.5'], [-1.5, '▼ -1.5'], [0, '— 0.0']]) {
  test(`old Opportunity run with delta ${delta} never claims the change happened today`, () => {
    const html = render(delta, false)
    assert.ok(html.includes(expected + ' in last run'))
    assert.ok(html.includes('Updated in latest run'))
    assert.ok(!html.includes('today'))
  })
}

test('current Opportunity run keeps today labels for its score and update', () => {
  const html = render(0.5, true)
  assert.ok(html.includes('▲ +0.5 today'))
  assert.ok(html.includes('Updated today'))
  assert.ok(!html.includes('in last run'))
})

test('missing comparison remains a new assessment, not a manufactured score change', () => {
  const html = render(null, false)
  assert.ok(html.includes('New assessment'))
  assert.ok(!html.includes('0.0 in last run'))
  assert.ok(!html.includes('today'))
})

test('a theme not updated by the latest run has no score-change badge', () => {
  const html = render(0.5, false, false)
  assert.ok(!html.includes('▲ +0.5'))
  assert.ok(!html.includes('Updated in latest run'))
})
