'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import styles from './WatchlistsClient.module.css'

export default function WatchlistDialog({ title, children, onClose, busy = false }: { title: string; children: ReactNode; onClose: () => void; busy?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const dialog = ref.current
    dialog?.showModal()
    return () => { dialog?.close(); previous?.focus() }
  }, [])
  return <dialog ref={ref} className={styles.dialog} aria-labelledby="watchlist-dialog-title" onCancel={event => { event.preventDefault(); if (!busy) onClose() }}>
    <header className={styles.dialogHeader}><h2 id="watchlist-dialog-title">{title}</h2><button type="button" aria-label="Close dialog" disabled={busy} onClick={onClose}>×</button></header>
    {children}
  </dialog>
}

