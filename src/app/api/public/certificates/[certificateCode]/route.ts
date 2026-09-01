import { NextResponse } from 'next/server'
import { getCertificateVerification } from '@/src/lib/eventCertificate'
import { rateLimit } from '@/src/lib/rateLimit'

export const runtime = 'nodejs'

export async function GET(req: Request, { params }: { params: Promise<{ certificateCode: string }> }) {
  const limit = await rateLimit(req, { key: 'public-certificate-verify', limit: 30, windowMs: 10 * 60 * 1000 })
  if (!limit.ok) return limit.response

  const { certificateCode } = await params
  const result = await getCertificateVerification(certificateCode)
  if (!result.data) {
    return NextResponse.json({ valid: false, error: result.error }, { status: result.status ?? 400, headers: limit.headers })
  }

  return NextResponse.json(
    {
      valid: !result.data.revokedAt,
      error: result.error ?? null,
      certificate: {
        code: result.data.code,
        issued_at: result.data.issuedAt,
        revoked_at: result.data.revokedAt,
        revoked_reason: result.data.revokedReason,
        ...result.data.snapshot,
      },
    },
    { status: result.status ?? 200, headers: limit.headers }
  )
}
