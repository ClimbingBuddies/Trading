'use client'

import { useEffect } from 'react'

const TRACKED_ROUTES = new Set(['/markets', '/opportunities', '/strategies'])
const MAX_RESOURCES = 100

function safeResourceName(value: string) {
  try {
    const url = new URL(value, window.location.origin)
    return `${url.origin}${url.pathname}`
  } catch {
    return value.split('?')[0].split('#')[0]
  }
}

export default function PerformanceWaterfallReporter() {
  useEffect(() => {
    const path = window.location.pathname
    if (!TRACKED_ROUTES.has(path)) return

    let cancelled = false

    const capture = () => {
      if (cancelled) return

      const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
      if (!navigation || navigation.duration <= 0) return

      const resources = (performance.getEntriesByType('resource') as PerformanceResourceTiming[])
        .filter((entry) => entry.duration > 0)
        .slice(0, MAX_RESOURCES)
        .map((entry) => ({
          name: safeResourceName(entry.name),
          initiatorType: entry.initiatorType || 'unknown',
          startTimeMs: Number(entry.startTime.toFixed(3)),
          durationMs: Number(entry.duration.toFixed(3)),
          transferSize: entry.transferSize || 0,
          encodedBodySize: entry.encodedBodySize || 0,
          decodedBodySize: entry.decodedBodySize || 0,
        }))

      const payload = {
        version: 'performance-waterfall-v1',
        path,
        capturedAt: new Date().toISOString(),
        navigation: {
          type: navigation.type,
          startTimeMs: Number(navigation.startTime.toFixed(3)),
          responseStartMs: Number(navigation.responseStart.toFixed(3)),
          responseEndMs: Number(navigation.responseEnd.toFixed(3)),
          domInteractiveMs: Number(navigation.domInteractive.toFixed(3)),
          domContentLoadedMs: Number(navigation.domContentLoadedEventEnd.toFixed(3)),
          loadEventEndMs: Number(navigation.loadEventEnd.toFixed(3)),
          durationMs: Number(navigation.duration.toFixed(3)),
          transferSize: navigation.transferSize || 0,
          encodedBodySize: navigation.encodedBodySize || 0,
          decodedBodySize: navigation.decodedBodySize || 0,
        },
        resourceCount: resources.length,
        resources,
      }

      const body = JSON.stringify(payload)
      if (navigator.sendBeacon) {
        navigator.sendBeacon('/api/performance-waterfall', new Blob([body], { type: 'application/json' }))
      } else {
        fetch('/api/performance-waterfall', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body,
          keepalive: true,
        }).catch(() => undefined)
      }
    }

    const scheduleCapture = () => window.setTimeout(capture, 750)
    if (document.readyState === 'complete') {
      scheduleCapture()
    } else {
      window.addEventListener('load', scheduleCapture, { once: true })
    }

    return () => {
      cancelled = true
      window.removeEventListener('load', scheduleCapture)
    }
  }, [])

  return null
}
