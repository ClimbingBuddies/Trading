'use client'

import { useRouter } from 'next/navigation'
import type { OpportunityTheme } from '@/lib/opportunities'

export default function OpportunityThemeSelect({
  themes,
  currentCode,
  currentView,
  className,
}: {
  themes: OpportunityTheme[]
  currentCode: string
  currentView: string
  className?: string
}) {
  const router = useRouter()

  return (
    <label className={className}>
      <span>Opportunity</span>
      <select
        aria-label="Select opportunity theme"
        value={currentCode}
        onChange={(event) => {
          const code = event.target.value.toLowerCase()
          const suffix = currentView === 'overview' ? '' : `?view=${encodeURIComponent(currentView)}`
          router.push(`/opportunities/${encodeURIComponent(code)}${suffix}`)
        }}
      >
        {themes.map((theme) => (
          <option key={theme.id} value={theme.theme_code}>{theme.theme_name}</option>
        ))}
      </select>
    </label>
  )
}
