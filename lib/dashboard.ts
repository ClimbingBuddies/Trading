import { getSupabase } from './supabase'

export type SyncRun = {
  id: string
  started_at: string
  finished_at: string | null
  requested_count: number
  received_count: number
  inserted_count: number
  status: string
  error_message: string | null
  metadata: Record<string, unknown> | null
}

export async function getAdminDashboardData() {
  const supabase = getSupabase()
  const now = new Date()
  const today = new Date(now)
  today.setUTCHours(0, 0, 0, 0)
  const since30 = new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000)

  const [runsRes, obsRes, activeRes, latestObsRes] = await Promise.all([
    supabase
      .from('sync_runs')
      .select('id,started_at,finished_at,requested_count,received_count,inserted_count,status,error_message,metadata')
      .gte('started_at', since30.toISOString())
      .order('started_at', { ascending: false }),
    supabase
      .from('market_observations')
      .select('loaded_at')
      .gte('loaded_at', since30.toISOString())
      .order('loaded_at', { ascending: false }),
    supabase
      .from('instruments')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true),
    supabase
      .from('market_observations')
      .select('loaded_at')
      .order('loaded_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  if (runsRes.error) throw runsRes.error
  if (obsRes.error) throw obsRes.error
  if (activeRes.error) throw activeRes.error
  if (latestObsRes.error) throw latestObsRes.error

  const runs = (runsRes.data ?? []) as SyncRun[]
  const observations = obsRes.data ?? []
  const todayIso = today.toISOString()
  const runsToday = runs.filter((r) => r.started_at >= todayIso)
  const observationsToday = observations.filter((o) => o.loaded_at >= todayIso).length

  const lastRun = runs[0] ?? null
  const lastSuccessful = runs.find((r) => r.status === 'succeeded') ?? null
  const failuresToday = runsToday.filter((r) => r.status === 'failed' || r.status === 'partial').length

  const dailyMap = new Map<string, { date: string; runs: number; inserted: number }>()
  for (let i = 0; i < 30; i++) {
    const d = new Date(since30.getTime() + i * 24 * 60 * 60 * 1000)
    const key = d.toISOString().slice(0, 10)
    dailyMap.set(key, { date: key, runs: 0, inserted: 0 })
  }
  for (const run of runs) {
    const key = run.started_at.slice(0, 10)
    const item = dailyMap.get(key)
    if (item) {
      item.runs += 1
      item.inserted += run.inserted_count ?? 0
    }
  }

  return {
    lastRun,
    lastSuccessful,
    loadsToday: runsToday.length,
    observationsToday,
    failuresToday,
    activeInstruments: activeRes.count ?? 0,
    latestObservationAt: latestObsRes.data?.loaded_at ?? null,
    recentRuns: runs.slice(0, 40),
    daily: [...dailyMap.values()],
  }
}

export async function getLoadDetail(id: string) {
  const supabase = getSupabase()
  const runRes = await supabase
    .from('sync_runs')
    .select('id,provider_id,started_at,finished_at,requested_count,received_count,inserted_count,status,error_message,metadata')
    .eq('id', id)
    .single()

  if (runRes.error) throw runRes.error
  const run = runRes.data
  const from = new Date(new Date(run.started_at).getTime() - 60_000).toISOString()
  const to = new Date(new Date(run.finished_at ?? run.started_at).getTime() + 60_000).toISOString()

  const obsRes = await supabase
    .from('market_observations')
    .select('id,instrument_id,observed_at,loaded_at,open,high,low,close,volume,currency_code,instruments(symbol,instrument_name,asset_type)')
    .gte('loaded_at', from)
    .lte('loaded_at', to)
    .order('loaded_at', { ascending: true })

  if (obsRes.error) throw obsRes.error
  return { run, observations: obsRes.data ?? [] }
}
