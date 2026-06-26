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

export const rateLimit = (req: Request, options: RateLimitOptions) => {
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

  const remaining = Math.max(options.limit - entry.count, 0)
  const retryAfterSeconds = Math.max(Math.ceil((entry.resetAt - now) / 1000), 1)
  const headers = {
    'Retry-After': String(retryAfterSeconds),
    'X-RateLimit-Limit': String(options.limit),
    'X-RateLimit-Remaining': String(remaining),
    'X-RateLimit-Reset': String(Math.ceil(entry.resetAt / 1000)),
  }

  if (entry.count > options.limit) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: 'Terlalu banyak percobaan. Coba lagi beberapa saat.' },
        { status: 429, headers }
      ),
    }
  }

  return { ok: true as const, headers }
}
