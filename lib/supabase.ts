import { createClient } from '@supabase/supabase-js'

const REQUIRED_ENVIRONMENT_VARIABLES = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
] as const

function getSupabaseConfiguration() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

  if (!url || !publishableKey) {
    const missing = REQUIRED_ENVIRONMENT_VARIABLES.filter((name) => !process.env[name])
    throw new Error(`Missing required Supabase environment configuration: ${missing.join(', ')}`)
  }

  return { url, publishableKey }
}

export function getSupabase() {
  const { url, publishableKey } = getSupabaseConfiguration()

  return createClient(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
