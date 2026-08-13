'use client'

import Link from 'next/link'
import { useRef, useState } from 'react'
import type { OpportunityOverviewRow } from '@/lib/opportunities'
import styles from '@/app/opportunities/opportunities.module.css'

function fmtScore(value: number | null | undefined) {
  return value === null || value === undefined ? '—' : Math.round(value).toString()
}

function themeHref(code: string) {
  return `/opportunities/${encodeURIComponent(code.toLowerCase())}`
}

function symbolSlug(symbol: string) {
  return symbol.replaceAll('/', '-').toLowerCase()
}

function toneClass(index: number) {
  return index % 3 === 0 ? styles.tone0 : index % 3 === 1 ? styles.tone1 : styles.tone2
}

export default function OpportunityCarousel({ rows }: { rows: OpportunityOverviewRow[] }) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [activeIndex, setActiveIndex] = useState(0)

  function move(direction: -1 | 1) {
    const track = trackRef.current
    if (!track) return
    const card = track.querySelector<HTMLElement>('[data-opportunity-card]')
    const distance = card ? card.offsetWidth + 14 : track.clientWidth * 0.9
    track.scrollBy({ left: direction * distance, behavior: 'smooth' })
  }

  function handleScroll() {
    const track = trackRef.current
    if (!track) return
    const cards = Array.from(track.querySelectorAll('[data-opportunity-card]')) as HTMLElement[]
    if (!cards.length) return
    const centre = track.scrollLeft + track.clientWidth / 2
    let nearest = 0
    let nearestDistance = Number.POSITIVE_INFINITY
    cards.forEach((card, index) => {
      const cardCentre = card.offsetLeft + card.offsetWidth / 2
      const distance = Math.abs(cardCentre - centre)
      if (distance < nearestDistance) {
        nearest = index
        nearestDistance = distance
      }
    })
    setActiveIndex(nearest)
  }

  if (!rows.length) return <div className={styles.darkEmpty}>No active Opportunity themes are available yet.</div>

  return (
    <section className={styles.carouselShell} aria-label="Opportunity themes">
      <button className={`${styles.carouselArrow} ${styles.carouselArrowLeft}`} type="button" onClick={() => move(-1)} aria-label="Previous opportunities">‹</button>
      <div className={styles.carouselTrack} ref={trackRef} onScroll={handleScroll}>
        {rows.map((row, index) => (
          <article className={`${styles.overviewThemeCard} ${toneClass(index)}`} key={row.theme.id} data-opportunity-card>
            <div className={styles.overviewThemeTop}>
              <div className={styles.themeIdentity}>
                <div className={styles.themeIcon} aria-hidden="true">{index % 3 === 0 ? '◇' : index % 3 === 1 ? '⌁' : '▣'}</div>
                <div>
                  <Link href={themeHref(row.theme.theme_code)} className={styles.themeTitleLink}>{row.theme.theme_name}</Link>
                  <span className={styles.darkLevelPill}>{row.latest?.opportunity_level?.replaceAll('_', ' ') ?? row.theme.status}</span>
                </div>
              </div>
              <div className={styles.cardScore}><strong>{fmtScore(row.latest?.opportunity_score)}</strong><span>/100</span></div>
            </div>
            <p>{row.theme.description ?? row.latest?.summary ?? 'Assessment detail will appear after the next Opportunity Assessment.'}</p>
            <div className={styles.cardTickerLabel}>Top Exposed Tickers</div>
            <div className={styles.tickerRow}>
              {row.exposures.slice(0, 4).map((exposure) => exposure.instruments?.symbol ? (
                <Link key={`${row.theme.id}-${exposure.instrument_id}`} className={styles.tickerChip} href={`/markets/${symbolSlug(exposure.instruments.symbol)}`}>
                  {exposure.instruments.symbol}<span>{fmtScore(exposure.exposure_score)}</span>
                </Link>
              ) : null)}
              {!row.exposures.length && <span className={styles.noTicker}>No mapped exposure yet</span>}
            </div>
          </article>
        ))}
      </div>
      <button className={`${styles.carouselArrow} ${styles.carouselArrowRight}`} type="button" onClick={() => move(1)} aria-label="Next opportunities">›</button>
      <div className={styles.carouselDots} aria-hidden="true">
        {rows.map((row, index) => <span className={index === activeIndex ? styles.carouselDotActive : ''} key={row.theme.id} />)}
      </div>
    </section>
  )
}
