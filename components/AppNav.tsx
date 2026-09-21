'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { getBrowserSupabase } from '@/lib/supabase-browser'

const items = [
  { href: '/login', label: 'Sign in', icon: '○' },
  { href: '/my-dashboard', label: 'My Dashboard', icon: '⌂' },
  { href: '/markets', label: 'Markets', icon: '⌁' },
  { href: '/assessments', label: 'Assessments', icon: '◇' },
  { href: '/opportunities', label: 'Opportunities', icon: '◎' },
  { href: '/watchlists', label: 'Watchlists', icon: '☆' },
  { href: '/alerts', label: 'Alerts', icon: '!' },
  { href: '/strategies', label: 'Strategies', icon: '⬡' },
  { href: '/help', label: 'Help', icon: '?' },
]

export default function AppNav() {
  const pathname = usePathname()
  const [signedIn, setSignedIn] = useState<boolean | null>(null)

  useEffect(() => {
    const client = getBrowserSupabase()
    void client.auth.getSession().then(({ data }) => setSignedIn(Boolean(data.session)))
    const { data: listener } = client.auth.onAuthStateChange((_event, session) => setSignedIn(Boolean(session)))
    return () => listener.subscription.unsubscribe()
  }, [])

  const visibleItems = items.filter((item) => item.href !== '/login' || signedIn === false)

  return (
    <aside className="sideNav">
      <div className="brandBlock">
        <div className="brandMark">⌃</div>
        <div className="brandWords">
          <strong>DISCOVER</strong>
          <strong>BOULDERS</strong>
          <strong>MARKETS</strong>
        </div>
      </div>

      <nav aria-label="Primary navigation">
        {visibleItems.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
          return (
            <Link className={active ? 'navItem navActive' : 'navItem'} href={item.href} key={item.href}>
              <span className="navIcon" aria-hidden="true">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          )
        })}
      </nav>

      <div className="navFooter">
        <span>Discover Boulders Markets</span>
        <small>Trading workspace</small>
      </div>
    </aside>
  )
}
