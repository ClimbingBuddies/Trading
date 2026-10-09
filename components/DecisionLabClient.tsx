'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { getBrowserSupabase } from '@/lib/supabase-browser'
import SharedDecisionWorkspace from './SharedDecisionWorkspace'

export default function DecisionLabClient() {
  const router = useRouter()
  const [signedIn, setSignedIn] = useState<boolean | null>(null)

  useEffect(() => {
    const client = getBrowserSupabase()
    let active = true
    void client.auth.getSession().then(({ data, error }) => {
      if (active) setSignedIn(!error && !!data.session?.user && !data.session.user.is_anonymous)
    })
    const { data: listener } = client.auth.onAuthStateChange((_event, session) => {
      if (active) setSignedIn(!!session?.user && !session.user.is_anonymous)
    })
    return () => { active = false; listener.subscription.unsubscribe() }
  }, [])

  useEffect(() => {
    if (signedIn === false) router.replace('/login?next=/decision-lab')
  }, [router, signedIn])

  if (signedIn !== true) return <section aria-live="polite"><h1>Decision Lab</h1><p>{signedIn === null ? 'Checking your session…' : 'Taking you to sign in…'}</p></section>

  return <>
    <header>
      <h1>Decision Lab</h1>
      <p>Shared AI calls and paper results are published once for all signed-in accounts. Choose “My watched shares” below to see the instruments you follow.</p>
      <p><Link href="/watchlists">Choose shares to track in Watchlists →</Link></p>
    </header>
    <SharedDecisionWorkspace />
  </>
}
