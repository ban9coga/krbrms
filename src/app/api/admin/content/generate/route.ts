import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/src/lib/auth'
import {
  buildContentGenerationInstructions,
  contentGenerationSchema,
  normalizeContentGenerationDraft,
  normalizeContentGenerationRequest,
} from '@/src/lib/contentGeneration'

export const runtime = 'nodejs'
export const maxDuration = 60

const attempts = new Map<string, number[]>()
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000
const RATE_LIMIT_MAX = 4

const isAllowed = (userId: string) => {
  const now = Date.now()
  const recent = (attempts.get(userId) ?? []).filter((time) => now - time < RATE_LIMIT_WINDOW_MS)
  if (recent.length >= RATE_LIMIT_MAX) return false
  recent.push(now)
  attempts.set(userId, recent)
  return true
}

const outputText = (response: unknown) => {
  if (!response || typeof response !== 'object') return ''
  const input = response as Record<string, unknown>
  if (typeof input.output_text === 'string') return input.output_text
  if (!Array.isArray(input.output)) return ''
  for (const item of input.output) {
    if (!item || typeof item !== 'object') continue
    const content = (item as Record<string, unknown>).content
    if (!Array.isArray(content)) continue
    for (const part of content) {
      if (part && typeof part === 'object' && typeof (part as Record<string, unknown>).text === 'string') {
        return (part as Record<string, unknown>).text as string
      }
    }
  }
  return ''
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req.headers.get('authorization'))
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAllowed(auth.user.id)) {
    return NextResponse.json({ error: 'Terlalu banyak permintaan AI. Tunggu beberapa menit lalu coba lagi.' }, { status: 429 })
  }

  const request = normalizeContentGenerationRequest(await req.json().catch(() => null))
  if (!request) return NextResponse.json({ error: 'Isi topik konten terlebih dahulu.' }, { status: 400 })

  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) {
    return NextResponse.json({ error: 'OPENAI_API_KEY belum diatur pada server. AI draft belum dapat digunakan.' }, { status: 503 })
  }

  const upstream = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: process.env.OPENAI_CONTENT_MODEL?.trim() || 'gpt-5-mini',
      store: false,
      max_output_tokens: 5000,
      input: [
        { role: 'developer', content: [{ type: 'input_text', text: buildContentGenerationInstructions(request) }] },
        { role: 'user', content: [{ type: 'input_text', text: `Generate the RacePushbike Content Studio draft for: ${request.topic}` }] },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'racepushbike_content_draft',
          strict: true,
          schema: contentGenerationSchema,
        },
      },
    }),
  })

  const payload = await upstream.json().catch(() => null)
  if (!upstream.ok) {
    const message = payload && typeof payload === 'object' && (payload as { error?: { message?: string } }).error?.message
    return NextResponse.json({ error: message || 'Layanan AI tidak dapat membuat draf saat ini.' }, { status: 502 })
  }

  const rawText = outputText(payload)
  let parsed: unknown
  try {
    parsed = JSON.parse(rawText)
  } catch {
    return NextResponse.json({ error: 'AI mengirim format draf yang tidak dapat dibaca. Coba lagi.' }, { status: 502 })
  }
  const draft = normalizeContentGenerationDraft(parsed)
  if (!draft) return NextResponse.json({ error: 'AI mengirim draf yang belum lengkap. Coba lagi.' }, { status: 502 })

  return NextResponse.json({ data: draft })
}
