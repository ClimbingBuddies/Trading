'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import ThemePaletteSelector from '@/components/ThemePaletteSelector'
import { getBrowserSupabase } from '@/lib/supabase-browser'

export default function AccountMenu() {
  const [email, setEmail] = useState<string | null>(null)

  useEffect(() => {
    const client = getBrowserSupabase()
    void client.auth.getSession().then(({ data }) => setEmail(data.session?.user.email ?? null))
    const { data: listener } = client.auth.onAuthStateChange((_event, session) => setEmail(session?.user.email ?? null))
    return () => listener.subscription.unsubscribe()
  }, [])

  if (!email) return null

  return (
    <details className="accountMenu">
      <summary aria-label="Open account and display settings">
        <span className="accountMenuAvatar" aria-hidden="true">{email.charAt(0).toUpperCase()}</span>
        <span className="accountMenuLabel">Account</span>
      </summary>
      <div className="accountMenuPanel">
        <div className="accountMenuIdentity"><span>Signed in as</span><strong>{email}</strong></div>
        <div className="accountMenuSection"><span className="accountMenuSectionLabel">Display</span><ThemePaletteSelector showLabel={false} /></div>
        <div className="accountMenuLinks"><Link href="/admin">Admin</Link><button type="button" onClick={() => void getBrowserSupabase().auth.signOut()}>Sign out</button></div>
      </div>
    </details>
  )
}
