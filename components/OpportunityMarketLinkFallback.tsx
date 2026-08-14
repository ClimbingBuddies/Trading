'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

function externalMarketUrl(symbol: string) {
  return `https://finance.yahoo.com/quote/${encodeURIComponent(symbol.toUpperCase())}`
}

export default function OpportunityMarketLinkFallback() {
  const pathname = usePathname()

  useEffect(() => {
    if (!pathname.startsWith('/opportunities/')) return

    const controller = new AbortController()
    const links = Array.from(
      document.querySelectorAll<HTMLAnchorElement>('a[class*="viewButton"][href^="/markets/"]'),
    )

    void Promise.all(links.map(async (link) => {
      const internalHref = link.getAttribute('href')
      if (!internalHref) return

      try {
        const response = await fetch(internalHref, {
          method: 'HEAD',
          cache: 'no-store',
          signal: controller.signal,
        })

        if (response.status !== 404) return

        const slug = internalHref.split('/').filter(Boolean).at(-1)
        if (!slug) return
        const symbol = decodeURIComponent(slug).replaceAll('-', '/')

        link.href = externalMarketUrl(symbol)
        link.target = '_blank'
        link.rel = 'noreferrer noopener'
        link.textContent = 'View external ↗'
        link.setAttribute('aria-label', `View ${symbol.toUpperCase()} on Yahoo Finance`)
      } catch (error) {
        if (controller.signal.aborted) return
        console.warn('Unable to resolve Opportunity market destination', error)
      }
    }))

    return () => controller.abort()
  }, [pathname])

  return null
}
