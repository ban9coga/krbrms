import { NextResponse } from 'next/server'

type RateLimitOptions = {
  key: string
  limit: number
  windowMs: number
}

type RateLimitEntry = {
  count: number
  resetAt: number
}

type RateLimitResult =
  | {
      ok: true
      headers: Record<string, string>
      source: 'memory' | 'redis'
    }
  | {
      ok: false
      response: NextResponse
      source: 'memory' | 'redis'
    }

const buckets = new Map<string, RateLimitEntry>()

const getClientIp = (req: Request) => {
  const forwardedFor = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return (
    req.headers.get('cf-connecting-ip')?.trim() ||
    req.headers.get('x-real-ip')?.trim() ||
    forwardedFor ||
    'unknown'
  )
}

const cleanupExpiredBuckets = (now: number) => {
  if (buckets.size < 1000) return
  for (const [key, entry] of buckets.entries()) {
    if (entry.resetAt <= now) buckets.delete(key)
  }
}

const buildHeaders = (limit: number, remaining: number, resetAt: number, now: number) => {
  const retryAfterSeconds = Math.max(Math.ceil((resetAt - now) / 1000), 1)
  return {
    'Retry-After': String(retryAfterSeconds),
    'X-RateLimit-Limit': String(limit),
    'X-RateLimit-Remaining': String(Math.max(remaining, 0)),
    'X-RateLimit-Reset': String(Math.ceil(resetAt / 1000)),
  }
}

const blockedResponse = (headers: Record<string, string>) =>
  NextResponse.json(
    { error: 'Terlalu banyak percobaan. Coba lagi beberapa saat.' },
    { status: 429, headers }
  )

const memoryRateLimit = (req: Request, options: RateLimitOptions): RateLimitResult => {
  const now = Date.now()
  cleanupExpiredBuckets(now)

  const ip = getClientIp(req)
  const bucketKey = `${options.key}:${ip}`
  const existing = buckets.get(bucketKey)
  const entry =
    existing && existing.resetAt > now
      ? existing
      : {
          count: 0,
          resetAt: now + options.windowMs,
        }

  entry.count += 1
  buckets.set(bucketKey, entry)

  const headers = buildHeaders(options.limit, options.limit - entry.count, entry.resetAt, now)

  if (entry.count > options.limit) {
    return {
      ok: false as const,
      response: blockedResponse(headers),
      source: 'memory',
    }
  }

  return { ok: true as const, headers, source: 'memory' }
}

const getRedisConfig = () => {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || ''
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || ''
  if (!url || !token) return null
  return { url: url.replace(/\/$/, ''), token }
}

const upstashPipeline = async (commands: unknown[][]) => {
  const config = getRedisConfig()
  if (!config) return null

  const response = await fetch(`${config.url}/pipeline`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(commands),
    cache: 'no-store',
  })

  if (!response.ok) throw new Error(`Redis rate limit failed: ${response.status}`)
  return (await response.json()) as Array<{ result?: unknown; error?: string }>
}

const redisRateLimit = async (
  req: Request,
  options: RateLimitOptions
): Promise<RateLimitResult | null> => {
  if (!getRedisConfig()) return null

  const now = Date.now()
  const ip = getClientIp(req)
  const bucketKey = `${options.key}:${ip}`

  try {
    const firstPass = await upstashPipeline([
      ['INCR', bucketKey],
      ['PTTL', bucketKey],
    ])
    if (!firstPass) return null

    const count = Number(firstPass[0]?.result ?? 0)
    let ttl = Number(firstPass[1]?.result ?? -1)

    if (!Number.isFinite(count) || count <= 0) return null
    if (!Number.isFinite(ttl) || ttl <= 0 || count === 1) {
      await upstashPipeline([['PEXPIRE', bucketKey, options.windowMs]])
      ttl = options.windowMs
    }

    const resetAt = now + ttl
    const headers = buildHeaders(options.limit, options.limit - count, resetAt, now)

    if (count > options.limit) {
      return {
        ok: false as const,
        response: blockedResponse(headers),
        source: 'redis',
      }
    }

    return { ok: true as const, headers, source: 'redis' }
  } catch {
    return null
  }
}

export const rateLimit = async (req: Request, options: RateLimitOptions) => {
  return (await redisRateLimit(req, options)) ?? memoryRateLimit(req, options)
}
