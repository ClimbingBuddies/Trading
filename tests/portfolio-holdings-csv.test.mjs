import assert from 'node:assert/strict'
import test from 'node:test'
import { HOLDINGS_CSV_COLUMNS, parseHoldingsCsv } from '../lib/portfolio-holdings-csv.mjs'

const header = HOLDINGS_CSV_COLUMNS.join(',')
const parse = (rows, options = {}) => parseHoldingsCsv(`${header}\r\n${rows}`, { today: '2026-09-05', ...options })
const codes = (result) => result.errors.map(({ code }) => code)

test('normalizes BOM, header casing, quoted fields and exact decimals', () => {
  const result = parseHoldingsCsv(`\ufeff SYMBOL , Exchange_Code,Quantity,average_cost_per_unit,cost_currency,acquired_at,notes\r\n"bhp","asx",+001.2300,000.00,aud,2024-02-29,"Long-term, core ""holding"""`, { today: '2026-09-05' })
  assert.equal(result.ok, true)
  assert.deepEqual(result.rows[0].value, {
    symbol: 'BHP', exchangeCode: 'ASX', quantity: '1.23', averageCostPerUnit: '0', costCurrency: 'AUD', acquiredAt: '2024-02-29', notes: 'Long-term, core "holding"',
  })
  assert.equal(result.rows[0].line, 2)
})

test('accepts valid UTF-8 bytes and rejects invalid UTF-8 and oversized input', () => {
  assert.equal(parseHoldingsCsv(new TextEncoder().encode(`${header}\nBHP,ASX,1,,AUD,,Résumé`), { today: '2026-09-05' }).ok, true)
  assert.deepEqual(codes(parseHoldingsCsv(Uint8Array.from([0xc3, 0x28]))), ['INVALID_UTF8'])
  assert.deepEqual(codes(parseHoldingsCsv('x'.repeat(1024 * 1024 + 1))), ['FILE_TOO_LARGE'])
})

test('ignores blank physical lines but rejects an all-blank canonical row', () => {
  const result = parse('\n,,,,,,\nBHP,ASX,1,,AUD,,')
  assert.equal(result.rows.length, 2)
  assert.deepEqual(result.rows[0].errors.map(({ code }) => code), ['EMPTY_ROW'])
})

test('reports malformed RFC 4180 input and column count drift', () => {
  assert.deepEqual(codes(parse('"BHP,ASX,1,,AUD,,')), ['MALFORMED_CSV'])
  assert.deepEqual(codes(parse('BHP,ASX,1,,AUD,')), ['COLUMN_COUNT_MISMATCH'])
})

test('rejects unknown, forbidden, duplicate and missing headers with stable codes', () => {
  const forbidden = parseHoldingsCsv(`${header},broker_account\nBHP,ASX,1,,AUD,,,secret`)
  assert.ok(codes(forbidden).includes('FORBIDDEN_COLUMN'))
  const unknown = parseHoldingsCsv(`${header},colour\nBHP,ASX,1,,AUD,,,blue`)
  assert.ok(codes(unknown).includes('UNKNOWN_COLUMN'))
  const duplicate = parseHoldingsCsv(`${header},symbol\nBHP,ASX,1,,AUD,,,BHP`)
  assert.ok(codes(duplicate).includes('DUPLICATE_COLUMN'))
  const missing = parseHoldingsCsv('symbol,exchange_code,quantity\nBHP,ASX,1')
  assert.ok(codes(missing).includes('MISSING_COLUMN'))
})

test('enforces decimal syntax, positivity and precision without estimating values', () => {
  assert.deepEqual(codes(parse('BHP,ASX,"1,000",,AUD,,')), ['INVALID_DECIMAL'])
  assert.deepEqual(codes(parse('BHP,ASX,1e3,,AUD,,')), ['INVALID_DECIMAL'])
  assert.deepEqual(codes(parse('BHP,ASX,0,,AUD,,')), ['QUANTITY_NOT_POSITIVE'])
  assert.deepEqual(codes(parse(`BHP,ASX,1.1234567890123,,AUD,,`)), ['DECIMAL_LIMIT_EXCEEDED'])
  const incomplete = parse('BHP,ASX,1,,AUD,,')
  assert.equal(incomplete.rows[0].value.averageCostPerUnit, null)
  assert.equal(incomplete.rows[0].value.acquiredAt, null)
})

test('validates calendar dates and rejects future acquisition dates', () => {
  assert.deepEqual(codes(parse('BHP,ASX,1,,AUD,2025-02-29,')), ['INVALID_ACQUIRED_AT'])
  assert.deepEqual(codes(parse('BHP,ASX,1,,AUD,2026-09-06,')), ['FUTURE_ACQUIRED_AT'])
})

test('normalizes keys and rejects duplicate instruments without summing quantities', () => {
  const result = parse(' bhp , asx ,1,,aud,,\nBHP,ASX,2,,AUD,,')
  assert.deepEqual(codes(result), ['DUPLICATE_IN_FILE'])
  assert.equal(result.rows[0].value.quantity, '1')
  assert.equal(result.rows[1].value.quantity, '2')
  assert.equal(result.rows[1].line, 3)
})

test('rejects invalid identifiers, currency, notes and excessive rows', () => {
  const invalid = parse('BHP,AS X,1,,AU,2024-01-01,"bad\u0007note"')
  assert.deepEqual(codes(invalid), ['INVALID_EXCHANGE_CODE', 'INVALID_COST_CURRENCY', 'INVALID_NOTES'])
  const rows = Array.from({ length: 1001 }, (_, index) => `S${index},ASX,1,,AUD,,`).join('\n')
  assert.deepEqual(codes(parse(rows)), ['TOO_MANY_ROWS'])
})
