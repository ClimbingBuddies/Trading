export const BATCH_SIZE = 8;
export const MAX_CYCLE_INSTRUMENTS = 64;
export const REQUEST_TIMEOUT_MS = 10_000;
export const DB_REQUEST_TIMEOUT_MS = 15_000;
const CYCLE_MS = 4 * 60 * 60 * 1000;
const UTC_ANCHOR_MS = 3 * 60 * 60 * 1000;
const START_WINDOW_MS = 15 * 60 * 1000;

export function refreshCycle(now: Date) {
  const time = now.getTime();
  if (!Number.isFinite(time)) throw new Error("Invalid cycle clock");
  const start = Math.floor((time - UTC_ANCHOR_MS) / CYCLE_MS) * CYCLE_MS + UTC_ANCHOR_MS;
  return {
    startedAt: new Date(start).toISOString(),
    endsAt: new Date(start + CYCLE_MS).toISOString(),
    acceptsStarts: time - start < START_WINDOW_MS,
  };
}

type Mapping = { instrument_id: string; instruments: { symbol: string } };
export function orderedCycleMappings<T extends Mapping>(mappings: T[]) {
  const unique = [...new Map(mappings.map((mapping) => [mapping.instrument_id, mapping])).values()];
  if (unique.length > MAX_CYCLE_INSTRUMENTS) throw new Error("Cycle capacity exceeded");
  return unique.sort((a, b) => a.instruments.symbol.localeCompare(b.instruments.symbol) || a.instrument_id.localeCompare(b.instrument_id));
}
