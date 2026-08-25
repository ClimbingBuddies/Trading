import { NextRequest, NextResponse } from 'next/server'

const TRACKED_ROUTES = new Set(['/markets', '/opportunities', '/strategies'])
const MAX_RESOURCES = 100
const MAX_RESOURCE_NAME_LENGTH = 300

type ResourceSample = {
  name?: unknown
  initiatorType?: unknown
  startTimeMs?: unknown
  durationMs?: unknown
  transferSize?: unknown
  encodedBodySize?: unknown
  decodedBodySize?: unknown
}

function finiteNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function cleanResource(sample: ResourceSample) {
  if (typeof sample.name !== 'string') return null
  return {
    name: sample.name.slice(0, MAX_RESOURCE_NAME_LENGTH),
    initiatorType: typeof sample.initiatorType === 'string' ? sample.initiatorType.slice(0, 40) : 'unknown',
    startTimeMs: finiteNumber(sample.startTimeMs),
    durationMs: finiteNumber(sample.durationMs),
    transferSize: finiteNumber(sample.transferSize),
    encodedBodySize: finiteNumber(sample.encodedBodySize),
    decodedBodySize: finiteNumber(sample.decodedBodySize),
  }
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const path = typeof body.path === 'string' ? body.path : ''
  if (body.version !== 'performance-waterfall-v1' || !TRACKED_ROUTES.has(path)) {
    return NextResponse.json({ error: 'invalid_payload' }, { status: 400 })
  }

  const navigation = body.navigation && typeof body.navigation === 'object'
    ? body.navigation as Record<string, unknown>
    : {}
  const resources = Array.isArray(body.resources)
    ? body.resources.slice(0, MAX_RESOURCES).map((sample) => cleanResource(sample as ResourceSample)).filter(Boolean)
    : []

  const sample = {
    version: 'performance-waterfall-v1',
    path,
    capturedAt: typeof body.capturedAt === 'string' ? body.capturedAt : null,
    userAgentClass: request.headers.get('user-agent')?.includes('Mobile') ? 'mobile' : 'desktop_or_other',
    navigation: {
      type: typeof navigation.type === 'string' ? navigation.type : null,
      responseStartMs: finiteNumber(navigation.responseStartMs),
      responseEndMs: finiteNumber(navigation.responseEndMs),
      domInteractiveMs: finiteNumber(navigation.domInteractiveMs),
      domContentLoadedMs: finiteNumber(navigation.domContentLoadedMs),
      loadEventEndMs: finiteNumber(navigation.loadEventEndMs),
      durationMs: finiteNumber(navigation.durationMs),
      transferSize: finiteNumber(navigation.transferSize),
      encodedBodySize: finiteNumber(navigation.encodedBodySize),
      decodedBodySize: finiteNumber(navigation.decodedBodySize),
    },
    resourceCount: resources.length,
    resources,
  }

  console.info('[performance-waterfall-v1]', JSON.stringify(sample))
  return new NextResponse(null, { status: 204, headers: { 'cache-control': 'no-store' } })
}
