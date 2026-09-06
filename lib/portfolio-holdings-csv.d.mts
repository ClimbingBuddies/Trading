export type HoldingsCsvIssue = { code: string; message: string; line: number | null; column: string | null }
export type HoldingsCsvValue = {
  symbol: string
  exchangeCode: string
  quantity: string
  averageCostPerUnit: string | null
  costCurrency: string
  acquiredAt: string | null
  notes: string | null
}
export type HoldingsCsvRow = { line: number; value: HoldingsCsvValue | null; errors: HoldingsCsvIssue[] }
export type HoldingsCsvResult = { ok: boolean; errors: HoldingsCsvIssue[]; rows: HoldingsCsvRow[] }
export function parseHoldingsCsv(input: string | Uint8Array, options?: { today?: string }): HoldingsCsvResult
