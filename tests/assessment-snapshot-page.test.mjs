import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import * as jsxRuntime from 'react/jsx-runtime'
import ts from 'typescript'
import { describeAssessmentSnapshot } from '../lib/assessment-snapshot-status.mjs'

const now = Date.parse('2026-10-27T00:00:00Z')
const row = (id, matching) => ({ assessment_id: id, instrument_id: 'stock-' + id, symbol: id, rating: 'Buy', score: 66, confidence: 84,
  assessment_date: '2026-10-21', summary: 'Saved research', convergence: {
    instrument_id: 'stock-' + id, ai_assessment_id: matching ? id : 'older-ai', assessment_date: matching ? '2026-10-21' : '2026-08-20',
    technical_signal: 'buy', technical_score: 79, technical_confidence: 100, convergence_label: 'strong_bullish', convergence_score: 74, convergence_confidence: 86,
  } })
async function render(rows) {
  const exports = {}
  const source = fs.readFileSync(new URL('../app/assessments/page.tsx', import.meta.url), 'utf8')
  class Clock extends Date { static now() { return now } }
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    exports, Date: Clock,
    require(name) {
      if (name === 'react/jsx-runtime') return jsxRuntime
      if (name === 'next/link') return { default: ({ children, ...props }) => React.createElement('a', props, children) }
      if (name.includes('AssessmentDonut')) return { default: () => React.createElement('div', null, 'Saved rating distribution') }
      if (name.includes('assessment-snapshot-status')) return { describeAssessmentSnapshot }
      if (name.includes('lib/dashboard')) return { getAssessmentsData: async () => ({ rows, latestDate: rows[0]?.assessment_date ?? null,
        distribution: [{ rating: 'Buy', count: rows.length }], averageConfidence: 84, highest: rows, lowest: rows, latestRun: { status: 'partial' },
      }) }
      throw new Error('Unexpected dependency: ' + name)
    },
  })
  return renderToStaticMarkup(await exports.default())
}

test('saved comparison preserves history while counting only exact displayed-AI matches', async () => {
  const html = await render([row('NEW', true), row('OLD', false)])
  assert.ok(html.includes('1 match displayed AI'))
  assert.ok(html.includes('1 other saved snapshots'))
  assert.ok(html.includes('Historical — different AI assessment'))
  assert.ok(html.includes('20 Aug 2026'))
  assert.ok(html.includes('21 Oct 2026'))
  assert.ok(html.includes('67 calendar days old'))
  assert.ok(html.includes('5 calendar days old'))
  assert.ok(html.includes('not a verified prediction success rate'))
  assert.ok(!html.includes('Current rating'))
  assert.ok(!html.includes('Latest Signal Comparison'))
})

test('all mismatched snapshots count as history, not matched Convergence coverage', async () => {
  const html = await render([row('ONE', false), row('TWO', false)])
  assert.ok(html.includes('0 match displayed AI'))
  assert.ok(html.includes('2 other saved snapshots'))
  assert.ok(html.includes('Saved rating, not a new call'))
})

test('missing Convergence remains unavailable instead of fabricating agreement', async () => {
  const html = await render([{ ...row('ONE', false), convergence: null }])
  assert.ok(html.includes('0 saved snapshots'))
  assert.ok(html.includes('Requires eligible Technical and AI inputs'))
  assert.ok(!html.includes('Historical — different AI assessment'))
})

test('empty saved data keeps the empty state without inventing a warning or match', async () => {
  const html = await render([])
  assert.ok(html.includes('No assessment data has been loaded yet'))
  assert.ok(!html.includes('Saved research — check source dates before use'))
})
