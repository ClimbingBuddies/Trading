import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const componentUrl = new URL('../components/MyDashboardClient.tsx', import.meta.url)

test('Decision Lab reads decisions and events through separate owner-scoped queries', async () => {
  const component = await readFile(componentUrl, 'utf8')
  assert.match(component, /\.from\('personal_decisions'\)/)
  assert.match(component, /\.from\('personal_decision_events'\)/)
  assert.match(component, /\.eq\('owner_user_id', ownerId\)/g)
  assert.match(component, /A persisted decision failed response validation/)
  assert.match(component, /Persisted decision event history failed response validation/)
})

test('Decision Lab preserves distinct clocks and honest lifecycle states', async () => {
  const component = await readFile(componentUrl, 'utf8')
  assert.match(component, /AI-signal decisions keep the original assessment cutoff/)
  assert.match(component, /The AI cutoff controls this clock/)
  assert.match(component, /The server capture clock controls this record/)
  assert.match(component, /'COMPLETED' : hasPaperPosition \? 'OPEN' : 'PENDING ENTRY'/)
  assert.match(component, /Entry price and returns remain unavailable until forward evidence exists/)
})

test('Decision Lab exposes isolated loading, empty and error states without trading claims', async () => {
  const component = await readFile(componentUrl, 'utf8')
  assert.match(component, /Decision Lab unavailable/)
  assert.match(component, /Loading private decisions…/)
  assert.match(component, /No forward decisions have been captured/)
  assert.match(component, /cannot place orders, connect a broker or present an unresolved return as zero/)
  assert.doesNotMatch(component, /\.from\('personal_decisions'\)\.(insert|update|delete)/)
})
