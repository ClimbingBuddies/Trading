// Compare the JSON decimal sent to PostgreSQL, not a binary-float approximation
// produced by multiplying or toFixed(). numeric rounds ties away from zero.
const TYPES = { open: [20, 8], high: [20, 8], low: [20, 8], close: [20, 8], adjusted_close: [20, 8], volume: [24, 4] };

export function storageDecimal(value, field) {
  const type = Object.hasOwn(TYPES, field) ? TYPES[field] : null;
  if (!type) throw new Error('Unknown history storage field');
  if (value === null) return null;
  if (!['number', 'string'].includes(typeof value) || (typeof value === 'number' && !Number.isFinite(value))) {
    throw new Error('Invalid history storage decimal');
  }
  const text = String(value);
  const match = text.length <= 512 && /^([+-]?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(text);
  if (!match) throw new Error('Invalid history storage decimal');
  const exponent = Number(match[4] || 0);
  if (!Number.isInteger(exponent) || Math.abs(exponent) > 400) throw new Error('History storage decimal exponent out of range');
  const [precision, scale] = type;
  const fraction = match[3] || '';
  const coefficient = BigInt(match[2] + fraction);
  const shift = exponent - fraction.length + scale;
  let rounded;
  if (shift >= 0) rounded = coefficient * 10n ** BigInt(shift);
  else {
    const divisor = 10n ** BigInt(-shift);
    rounded = coefficient / divisor + (coefficient % divisor * 2n >= divisor ? 1n : 0n);
  }
  if (rounded >= 10n ** BigInt(precision)) throw new Error('History storage decimal exceeds column precision');
  return (match[1] === '-' && rounded !== 0n ? '-' : '') + rounded.toString();
}
