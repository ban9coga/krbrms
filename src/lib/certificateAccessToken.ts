import { createHmac, timingSafeEqual } from 'node:crypto'
import type { CertificateContext } from './eventCertificate'

const TOKEN_TTL_SECONDS = 10 * 60
const TOKEN_VERSION = 1

type CertificateAccessPayload = {
  version: number
  expiresAt: number
  context: CertificateContext
}

const getSigningSecret = () => {
  const secret = process.env.CERTIFICATE_ACCESS_TOKEN_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!secret) throw new Error('CERTIFICATE_ACCESS_TOKEN_SECRET belum diset.')
  return secret
}

const sign = (encodedPayload: string) => createHmac('sha256', getSigningSecret()).update(encodedPayload).digest('base64url')

const isEqualSignature = (left: string, right: string) => {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

export const createCertificateAccessToken = (context: CertificateContext) => {
  const expiresAt = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS
  const payload: CertificateAccessPayload = { version: TOKEN_VERSION, expiresAt, context }
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return {
    token: `${encodedPayload}.${sign(encodedPayload)}`,
    expiresAt: new Date(expiresAt * 1000).toISOString(),
  }
}

export const readCertificateAccessToken = (value: unknown): { context: CertificateContext; expiresAt: string } | null => {
  const token = typeof value === 'string' ? value.trim() : ''
  if (!token || token.length > 32_000) return null

  const [encodedPayload, signature, ...rest] = token.split('.')
  if (!encodedPayload || !signature || rest.length > 0 || !isEqualSignature(signature, sign(encodedPayload))) return null

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as Partial<CertificateAccessPayload>
    const expiresAt = Number(payload.expiresAt)
    const context = payload.context
    if (
      payload.version !== TOKEN_VERSION ||
      !Number.isFinite(expiresAt) ||
      expiresAt <= Math.floor(Date.now() / 1000) ||
      !context ||
      typeof context !== 'object' ||
      !context.event ||
      typeof context.event.id !== 'string' ||
      !Array.isArray(context.riders)
    ) {
      return null
    }

    return { context: context as CertificateContext, expiresAt: new Date(expiresAt * 1000).toISOString() }
  } catch {
    return null
  }
}
