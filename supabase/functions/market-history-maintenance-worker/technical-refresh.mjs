// A derived-calculation failure must not retry an already persisted provider load.
// The job warning is durable; the existing Technical schedule is the recovery path.
export async function refreshAsxTechnical(db, instrumentId) {
  try {
    const { data, error } = await db.rpc('refresh_market_trends_for_instrument', { p_instrument_id: instrumentId });
    if (error || !data?.asx || data.instrument_id !== instrumentId) throw new Error('ASX refresh receipt unavailable');
    const result = data.asx;
    if (![result.blocked_instruments, result.instruments_processed, result.score_rows_upserted]
      .every(value => Number.isInteger(value) && value >= 0)) throw new Error('Invalid ASX refresh counts');
    if (result.blocked_instruments > 0) {
      return { status: 'blocked', warning: 'ASX Technical refresh blocked by source admission; inspect Technical source diagnostics before retry.' };
    }
    if (result.instruments_processed === 0 && result.score_rows_upserted === 0) {
      return { status: 'skipped', warning: null };
    }
    if (result.instruments_processed !== 1 || result.score_rows_upserted !== 1) throw new Error('Unexpected ASX refresh receipt');
    return { status: 'succeeded', warning: null };
  } catch {
    return { status: 'failed', warning: 'ASX Technical refresh failed after history persisted; inspect the Technical engine and recover through its existing schedule.' };
  }
}
