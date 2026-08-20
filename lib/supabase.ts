import { createClient } from '@supabase/supabase-js'

const TRADING_SUPABASE_URL = 'https://glvbqcplgjdfgjyknzsa.supabase.co'
const TRADING_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_KSl5tOtru3k5RldP3OA1cQ_1rrO3cz2'

export function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? TRADING_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? TRADING_SUPABASE_PUBLISHABLE_KEY

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
