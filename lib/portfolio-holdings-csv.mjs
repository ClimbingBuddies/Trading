const MAX_BYTES = 1024 * 1024
const MAX_ROWS = 1000
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f]/u
const DECIMAL = /^\+?(?:\d+(?:\.\d*)?|\.\d+)$/u
const EXCHANGE_CODE = /^[A-Z0-9_.-]{1,16}$/u
const CURRENCY = /^[A-Z]{3}$/u

export const HOLDINGS_CSV_COLUMNS = Object.freeze([
  'symbol',
  'exchange_code',
  'quantity',
  'average_cost_per_unit',
  'cost_currency',
  'acquired_at',
  'notes',
])

const FORBIDDEN_HEADER_TERMS = /(?:account|broker|bsb|routing|tax|market[ _-]?value|total[ _-]?cost|price)/iu

const issue = (code, message, line = null, column = null) => ({ code, message, line, column })

function decodeInput(input) {
  if (typeof input === 'string') {
    const bytes = new TextEncoder().encode(input).byteLength
    return bytes > MAX_BYTES
      ? { error: issue('FILE_TOO_LARGE', `CSV exceeds the ${MAX_BYTES}-byte limit.`) }
      : { text: input }
  }
  if (!(input instanceof Uint8Array)) {
    return { error: issue('INVALID_INPUT', 'CSV input must be text or UTF-8 bytes.') }
  }
  if (input.byteLength > MAX_BYTES) {
    return { error: issue('FILE_TOO_LARGE', `CSV exceeds the ${MAX_BYTES}-byte limit.`) }
  }
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(input) }
  } catch {
    return { error: issue('INVALID_UTF8', 'CSV must contain valid UTF-8 text.') }
  }
}

function parseRecords(text) {
  const records = []
  let record = []
  let field = ''
  let quoted = false
  let afterQuote = false
  let line = 1
  let recordLine = 1

  const finishRecord = () => {
    record.push(field)
    if (!(record.length === 1 && record[0].trim() === '')) records.push({ line: recordLine, fields: record })
    record = []
    field = ''
    recordLine = line + 1
  }

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          field += '"'
          index += 1
        } else {
          quoted = false
          afterQuote = true
        }
      } else {
        field += character
        if (character === '\n') line += 1
      }
      continue
    }
    if (afterQuote) {
      if (character === ',') {
        record.push(field)
        field = ''
        afterQuote = false
      } else if (character === '\r' || character === '\n') {
        if (character === '\r' && text[index + 1] === '\n') index += 1
        finishRecord()
        afterQuote = false
        line += 1
      } else {
        return { error: issue('MALFORMED_CSV', 'Unexpected character after a closing quote.', line) }
      }
    } else if (character === '"') {
      if (field.length !== 0) return { error: issue('MALFORMED_CSV', 'A quoted field must start with a quote.', line) }
      quoted = true
    } else if (character === ',') {
      record.push(field)
      field = ''
    } else if (character === '\r' || character === '\n') {
      if (character === '\r' && text[index + 1] === '\n') index += 1
      finishRecord()
      line += 1
    } else {
      field += character
    }
  }
  if (quoted) return { error: issue('MALFORMED_CSV', 'Quoted field is not closed.', recordLine) }
  if (afterQuote || field.length > 0 || record.length > 0) finishRecord()
  return { records }
}

function normalizeDecimal(value, { positive, column, line }) {
  if (!DECIMAL.test(value)) return { error: issue('INVALID_DECIMAL', `${column} must be a plain decimal.`, line, column) }
  const unsigned = value.startsWith('+') ? value.slice(1) : value
  const [integerPart = '', fractionalPart = ''] = unsigned.split('.')
  if (fractionalPart.length > 12 || integerPart.length + fractionalPart.length > 30) {
    return { error: issue('DECIMAL_LIMIT_EXCEEDED', `${column} exceeds its precision limit.`, line, column) }
  }
  const integer = (integerPart || '0').replace(/^0+(?=\d)/u, '')
  const fraction = fractionalPart.replace(/0+$/u, '')
  const normalized = fraction ? `${integer}.${fraction}` : integer
  if (positive && /^0(?:\.0*)?$/u.test(normalized)) {
    return { error: issue('QUANTITY_NOT_POSITIVE', 'quantity must be greater than zero.', line, column) }
  }
  return { value: normalized }
}

function isRealDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value
}

function normalizeRow(values, line, today) {
  const errors = []
  const raw = Object.fromEntries(HOLDINGS_CSV_COLUMNS.map((column) => [column, values[column].trim()]))
  if (Object.values(raw).every((value) => value === '')) {
    return { errors: [issue('EMPTY_ROW', 'A data row cannot have all canonical fields blank.', line)] }
  }

  const symbol = raw.symbol.toUpperCase()
  if (!symbol || symbol.length > 32 || CONTROL_CHARACTERS.test(symbol)) errors.push(issue('INVALID_SYMBOL', 'symbol must be 1–32 control-free characters.', line, 'symbol'))
  const exchangeCode = raw.exchange_code.toUpperCase()
  if (!EXCHANGE_CODE.test(exchangeCode)) errors.push(issue('INVALID_EXCHANGE_CODE', 'exchange_code has an invalid format.', line, 'exchange_code'))

  const quantity = normalizeDecimal(raw.quantity, { positive: true, column: 'quantity', line })
  if (quantity.error) errors.push(quantity.error)
  let averageCostPerUnit = null
  if (raw.average_cost_per_unit) {
    const cost = normalizeDecimal(raw.average_cost_per_unit, { positive: false, column: 'average_cost_per_unit', line })
    if (cost.error) errors.push(cost.error)
    else averageCostPerUnit = cost.value
  }

  const costCurrency = raw.cost_currency.toUpperCase()
  if (!CURRENCY.test(costCurrency)) errors.push(issue('INVALID_COST_CURRENCY', 'cost_currency must be exactly three ASCII letters.', line, 'cost_currency'))
  if (raw.acquired_at && (!isRealDate(raw.acquired_at) || raw.acquired_at > today)) {
    errors.push(issue(raw.acquired_at > today && isRealDate(raw.acquired_at) ? 'FUTURE_ACQUIRED_AT' : 'INVALID_ACQUIRED_AT', 'acquired_at must be a real, non-future YYYY-MM-DD date.', line, 'acquired_at'))
  }
  if (raw.notes.length > 500 || CONTROL_CHARACTERS.test(raw.notes)) errors.push(issue('INVALID_NOTES', 'notes must be control-free and at most 500 characters.', line, 'notes'))

  return {
    errors,
    value: {
      symbol,
      exchangeCode,
      quantity: quantity.value ?? null,
      averageCostPerUnit,
      costCurrency,
      acquiredAt: raw.acquired_at || null,
      notes: raw.notes || null,
    },
  }
}

export function parseHoldingsCsv(input, options = {}) {
  const decoded = decodeInput(input)
  if (decoded.error) return { ok: false, errors: [decoded.error], rows: [] }
  const text = decoded.text.startsWith('\ufeff') ? decoded.text.slice(1) : decoded.text
  const parsed = parseRecords(text)
  if (parsed.error) return { ok: false, errors: [parsed.error], rows: [] }
  if (parsed.records.length === 0) return { ok: false, errors: [issue('MISSING_HEADER', 'CSV requires a header row.')], rows: [] }

  const header = parsed.records[0]
  const normalizedHeaders = header.fields.map((value) => value.trim().toLowerCase())
  const headerErrors = []
  if (new Set(normalizedHeaders).size !== normalizedHeaders.length) headerErrors.push(issue('DUPLICATE_COLUMN', 'CSV header contains a duplicate column.', header.line))
  for (const column of normalizedHeaders) {
    if (!HOLDINGS_CSV_COLUMNS.includes(column)) {
      headerErrors.push(issue(FORBIDDEN_HEADER_TERMS.test(column) ? 'FORBIDDEN_COLUMN' : 'UNKNOWN_COLUMN', `Column "${column}" is not allowed.`, header.line, column))
    }
  }
  for (const column of HOLDINGS_CSV_COLUMNS) {
    if (!normalizedHeaders.includes(column)) headerErrors.push(issue('MISSING_COLUMN', `Required canonical column "${column}" is missing.`, header.line, column))
  }
  if (headerErrors.length) return { ok: false, errors: headerErrors, rows: [] }

  const dataRecords = parsed.records.slice(1)
  if (dataRecords.length > MAX_ROWS) return { ok: false, errors: [issue('TOO_MANY_ROWS', `CSV exceeds the ${MAX_ROWS}-row limit.`)], rows: [] }
  const today = options.today ?? new Date().toISOString().slice(0, 10)
  if (!isRealDate(today)) return { ok: false, errors: [issue('INVALID_TODAY', 'today must be a real YYYY-MM-DD date.')], rows: [] }
  const rows = []
  const seenKeys = new Map()
  for (const record of dataRecords) {
    if (record.fields.length !== HOLDINGS_CSV_COLUMNS.length) {
      rows.push({ line: record.line, value: null, errors: [issue('COLUMN_COUNT_MISMATCH', 'Row column count does not match the header.', record.line)] })
      continue
    }
    const values = Object.fromEntries(normalizedHeaders.map((column, index) => [column, record.fields[index]]))
    const normalized = normalizeRow(values, record.line, today)
    const key = normalized.value ? `${normalized.value.symbol}\u0000${normalized.value.exchangeCode}` : null
    if (key && normalized.value.symbol && normalized.value.exchangeCode) {
      if (seenKeys.has(key)) {
        normalized.errors.push(issue('DUPLICATE_IN_FILE', `Instrument duplicates CSV line ${seenKeys.get(key)}.`, record.line))
      } else {
        seenKeys.set(key, record.line)
      }
    }
    rows.push({ line: record.line, value: normalized.value ?? null, errors: normalized.errors })
  }
  const errors = rows.flatMap((row) => row.errors)
  return { ok: errors.length === 0, errors, rows }
}
