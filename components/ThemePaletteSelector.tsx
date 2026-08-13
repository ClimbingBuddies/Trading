'use client'

import { useEffect, useState } from 'react'

const STORAGE_KEY = 'discover-boulders-market-palette'

const PALETTES = [
  { value: 'midnight-blue', label: 'Midnight Blue' },
  { value: 'original-green', label: 'Original Green' },
  { value: 'copper-ember', label: 'Copper Ember' },
  { value: 'plum-night', label: 'Plum Night' },
  { value: 'stone-paper', label: 'Stone Paper' },
] as const

type PaletteId = (typeof PALETTES)[number]['value']

function isPalette(value: string | null): value is PaletteId {
  return PALETTES.some((palette) => palette.value === value)
}

export default function ThemePaletteSelector() {
  const [palette, setPalette] = useState<PaletteId>('midnight-blue')

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY)
    const migrated = saved === 'alpine-light' ? 'stone-paper' : saved
    const resolved: PaletteId = isPalette(migrated) ? migrated : 'midnight-blue'
    setPalette(resolved)
    document.documentElement.dataset.theme = resolved
    if (saved !== resolved) window.localStorage.setItem(STORAGE_KEY, resolved)
  }, [])

  function updatePalette(next: PaletteId) {
    setPalette(next)
    document.documentElement.dataset.theme = next
    window.localStorage.setItem(STORAGE_KEY, next)
  }

  return (
    <label className="themePaletteControl">
      <span className="themePaletteLabel">Palette</span>
      <span className="themePaletteSelectRow">
        <span className="themePaletteSwatch" aria-hidden="true" />
        <select
          aria-label="Dashboard colour palette"
          value={palette}
          onChange={(event) => updatePalette(event.target.value as PaletteId)}
        >
          {PALETTES.map((item) => (
            <option key={item.value} value={item.value}>{item.label}</option>
          ))}
        </select>
      </span>
    </label>
  )
}
