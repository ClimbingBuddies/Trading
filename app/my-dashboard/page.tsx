import { Suspense } from 'react'
import MyDashboardClient from '@/components/MyDashboardClient'

export default function MyDashboardPage() {
  return (
    <div className="page">
      <Suspense fallback={<section aria-live="polite"><h1>My Dashboard</h1><p>Opening your private workspace…</p></section>}>
        <MyDashboardClient />
      </Suspense>
    </div>
  )
}
