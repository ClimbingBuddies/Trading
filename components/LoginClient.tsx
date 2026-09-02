'use client'

import { FormEvent, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { getBrowserSupabase } from '@/lib/supabase-browser'
import styles from './LoginClient.module.css'

type Mode = 'sign-in' | 'create-account'

function safeDestination(value: string | null) {
  return value?.startsWith('/') && !value.startsWith('//') ? value : '/my-dashboard'
}

export default function LoginClient() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const destination = safeDestination(searchParams.get('next'))
  const [mode, setMode] = useState<Mode>('sign-in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')

  useEffect(() => {
    let active = true
    const supabase = getBrowserSupabase()

    supabase.auth.getSession().then(({ data }) => {
      if (active && data.session) router.replace(destination)
    })

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active && session) router.replace(destination)
    })

    return () => {
      active = false
      data.subscription.unsubscribe()
    }
  }, [destination, router])

  async function submitCredentials(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError('')
    setStatus('')

    try {
      const supabase = getBrowserSupabase()
      if (mode === 'sign-in') {
        const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
        if (authError) throw authError
        router.replace(destination)
        router.refresh()
      } else {
        const { data, error: authError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: `${window.location.origin}${destination}` },
        })
        if (authError) throw authError
        if (data.session) {
          router.replace(destination)
          router.refresh()
        } else {
          setStatus('Account created. Check your email to confirm your address, then sign in.')
          setMode('sign-in')
        }
      }
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : 'Sign-in failed. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  async function signInWithGoogle() {
    setBusy(true)
    setError('')
    setStatus('')

    const { error: authError } = await getBrowserSupabase().auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}${destination}` },
    })

    if (authError) {
      setError(authError.message)
      setBusy(false)
    }
  }

  function changeMode(nextMode: Mode) {
    setMode(nextMode)
    setError('')
    setStatus('')
  }

  return (
    <div className={styles.loginLayout}>
      <aside className={styles.brandPanel} aria-label="Boulders Markets">
        <div className={styles.brandLockup}>
          <span className={styles.brandMark} aria-hidden="true">⌃</span>
          <span><strong>BOULDERS</strong><small>MARKETS</small></span>
        </div>
        <div className={styles.brandStory}>
          <span className={styles.eyebrow}>YOUR MARKET EDGE</span>
          <h1>See the signal.<br />Own the decision.</h1>
          <p>One private workspace for market monitoring, research evidence and strategy validation.</p>
        </div>
        <div className={styles.trustRow}>
          <span><strong>30</strong> tracked instruments</span>
          <span><strong>24/7</strong> market monitoring</span>
        </div>
      </aside>

      <section className={styles.authPanel}>
        <div className={styles.authCard}>
          <header className={styles.intro}>
            <span className={styles.eyebrow}>SECURE ACCESS</span>
            <h2>{mode === 'sign-in' ? 'Welcome back' : 'Start your workspace'}</h2>
            <p>{mode === 'sign-in' ? 'Sign in to continue to Boulders Markets.' : 'Create a private research account in seconds.'}</p>
          </header>

          <div className={styles.modeSwitch} role="group" aria-label="Authentication mode">
            <button type="button" aria-pressed={mode === 'sign-in'} onClick={() => changeMode('sign-in')} disabled={busy}>Sign in</button>
            <button type="button" aria-pressed={mode === 'create-account'} onClick={() => changeMode('create-account')} disabled={busy}>Create account</button>
          </div>

          {error ? <div className={styles.error} role="alert">{error}</div> : null}
          {status ? <div className={styles.status} role="status">{status}</div> : null}

          <button className={styles.googleButton} type="button" onClick={signInWithGoogle} disabled={busy}>
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <path fill="var(--chart-1)" d="M21.6 12.2c0-.7-.1-1.5-.2-2.2H12v4.3h5.4a4.7 4.7 0 0 1-2 3v2.8h3.5c2-1.9 3.2-4.6 3.2-7.9Z" />
              <path fill="var(--chart-3)" d="M12 22c2.9 0 5.3-.9 7-2.6l-3.5-2.8a6.4 6.4 0 0 1-9.5-3.4H2.4V16A10 10 0 0 0 12 22Z" />
              <path fill="var(--chart-4)" d="M6 13.2a6 6 0 0 1 0-3.9V6.5H2.4a10 10 0 0 0 0 9.5L6 13.2Z" />
              <path fill="var(--chart-6)" d="M12 5.8c1.6 0 3 .5 4.1 1.6l3.1-3A10 10 0 0 0 2.4 6.5L6 9.3A6 6 0 0 1 12 5.8Z" />
            </svg>
            Continue with Google
          </button>

          <div className={styles.divider}><span>or continue with email</span></div>

          <form className={styles.form} onSubmit={submitCredentials}>
            <label htmlFor="login-email">Email address</label>
            <input id="login-email" name="email" type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(event) => setEmail(event.target.value)} required />

            <label htmlFor="login-password">Password</label>
            <div className={styles.passwordField}>
              <input id="login-password" name="password" type={showPassword ? 'text' : 'password'} autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'} placeholder="At least 8 characters" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} required />
              <button type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? 'Hide' : 'Show'}</button>
            </div>

            <button className={styles.primaryButton} type="submit" disabled={busy}>
              {busy ? 'Securing your session…' : mode === 'sign-in' ? 'Sign in to workspace' : 'Create private account'}
            </button>
          </form>

          <footer className={styles.securityNote}>
            <span aria-hidden="true">✓</span>
            <small>Protected by Supabase Auth. Boulders Markets never stores your password.</small>
          </footer>
        </div>
      </section>
    </div>
  )
}
