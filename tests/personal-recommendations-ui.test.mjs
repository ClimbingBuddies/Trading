import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const componentUrl = new URL('../components/MyDashboardClient.tsx', import.meta.url)
const stylesUrl = new URL('../components/MyDashboardClient.module.css', import.meta.url)

test('Recommendations UI loads snapshot, sources and events as separate owner-scoped reads', async () => {
  const component = await readFile(componentUrl, 'utf8')
  assert.match(component, /\.from\('personal_recommendation_snapshots'\)/)
  assert.match(component, /\.from\('personal_recommendation_sources'\)/)
  assert.match(component, /\.from\('personal_recommendation_events'\)/)
  assert.match(component, /\.eq\('owner_user_id', ownerId\)/g)
  assert.match(component, /Cards remain hidden until their snapshot, provenance and feedback history load together/)
  assert.match(component, /Persisted recommendation provenance failed response validation/)
  assert.match(component, /A recommendation is missing its required source lineage/)
  assert.match(component, /Date\.parse\(source\.source_cutoff\) <= Date\.parse\(snapshot\.source_cutoff\)/)
})

test('Recommendations UI keeps evidence families, risks, cutoffs and methodology visible', async () => {
  const component = await readFile(componentUrl, 'utf8')
  assert.match(component, /Principal risks/)
  assert.match(component, /Evidence cutoff/)
  assert.match(component, /Snapshot methodology/)
  assert.match(component, /\['MARKET_AI', 'TECHNICAL', 'OPPORTUNITY', 'EXTERNAL_FACT'\]/)
  assert.match(component, /Opportunity evidence can explain relevance but never creates a short-term action label by itself/)
})

test('feedback appends an event and never updates source assessments or recommendation snapshots', async () => {
  const component = await readFile(componentUrl, 'utf8')
  assert.match(component, /\.rpc\('append_personal_recommendation_event_v1'/)
  assert.match(component, /The snapshot and its source assessments remain unchanged/)
  assert.doesNotMatch(component, /\.from\('personal_recommendation_snapshots'\)\.(update|delete|insert)/)
  assert.doesNotMatch(component, /\.from\('(gpt_market_assessments|market_convergence_assessments|opportunity_assessments)'\)\.(update|delete|insert)/)
})

test('unsupported paths remain denied and recommendation actions stay keyboard-sized', async () => {
  const [component, styles] = await Promise.all([readFile(componentUrl, 'utf8'), readFile(stylesUrl, 'utf8')])
  assert.match(component, /No recommendation is invented from Opportunity alone, momentum, one indicator, stale evidence or an unsupported model opinion/)
  assert.doesNotMatch(component, />Buy</i)
  assert.doesNotMatch(component, />Sell</i)
  assert.match(component, /Paper decision — later gate/)
  assert.match(styles, /\.recommendationActions a,\.recommendationActions button,[^{]*\.stateCard button\{[^}]*min-height:44px/)
  assert.match(styles, /@media\(max-width:680px\)[\s\S]*\.recommendationActions>\*\{flex:1 1 100%\}/)
})

test('loading, empty and error states expose honest accessible status and retry semantics', async () => {
  const [component, styles] = await Promise.all([readFile(componentUrl, 'utf8'), readFile(stylesUrl, 'utf8')])
  assert.match(component, /role="status" aria-busy="true"[^>]*>[\s\S]*Loading recommendation snapshots/)
  assert.match(component, /role="status"[^>]*>[\s\S]*NO CURRENT SHORTLIST[\s\S]*No supported recommendation is available/)
  assert.match(component, /RECOMMENDATIONS UNAVAILABLE[\s\S]*Private recommendations could not be loaded/)
  assert.match(component, /<article className=\{styles\.stateCard\} role="alert">[\s\S]*Try again<\/button>/)
  assert.match(styles, /\.stateCard button\{[^}]*min-height:44px/)
  assert.match(styles, /\.stateCard button:focus-visible\{[^}]*outline:3px solid var\(--accent\)/)
})
