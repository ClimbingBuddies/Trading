// Read-side method admission; never substitute a different venue's methodology.
export function supportsConvergence(method: string, exchange: string | null | undefined) {
  return method === (exchange === 'ASX' ? 'market-convergence-asx-v1' : 'market-convergence-v1')
}
