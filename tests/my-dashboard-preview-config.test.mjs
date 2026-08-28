import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const envText = await readFile(new URL('../.env', import.meta.url), 'utf8')
const entries = envText
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean)
  .map((line) => line.split('=', 2))

test('preview configuration contains only browser-safe Supabase values', () => {
  assert.deepEqual(
    entries.map(([name]) => name).sort(),
    ['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'NEXT_PUBLIC_SUPABASE_URL'],
  )

  const values = Object.fromEntries(entries)
  assert.equal(
    values.NEXT_PUBLIC_SUPABASE_URL,
    'https://glvbqcplgjdfgjyknzsa.supabase.co',
  )
  assert.match(values.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, /^sb_publishable_[A-Za-z0-9_-]+$/)
  assert.doesNotMatch(envText, /service[_-]?role|secret|password|provider[_-]?key/i)
})
