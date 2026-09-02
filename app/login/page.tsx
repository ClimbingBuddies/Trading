import { Suspense } from 'react'
import LoginClient from '@/components/LoginClient'

export default function LoginPage() {
  return (
    <div className="page">
      <Suspense fallback={<section aria-live="polite"><h1>Sign in</h1><p>Opening secure sign-in…</p></section>}>
        <LoginClient />
      </Suspense>
    </div>
  )
}
