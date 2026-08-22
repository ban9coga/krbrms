import { NextResponse } from 'next/server'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { loadCertificateContext } from '@/src/lib/eventCertificate'
import { rateLimit } from '@/src/lib/rateLimit'

export const runtime = 'nodejs'

const fitText = (text: string, maxWidth: number, font: { widthOfTextAtSize: (value: string, size: number) => number }) => {
  for (let size = 42; size >= 18; size -= 1) {
    if (font.widthOfTextAtSize(text, size) <= maxWidth) return size
  }
  return 18
}

const drawCentered = (
  page: { drawText: (text: string, options: Record<string, unknown>) => void; getWidth: () => number },
  text: string,
  y: number,
  size: number,
  font: { widthOfTextAtSize: (value: string, size: number) => number },
  color: ReturnType<typeof rgb>
) => {
  page.drawText(text, { x: (page.getWidth() - font.widthOfTextAtSize(text, size)) / 2, y, size, font, color })
}

const sanitizeFilename = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'rider'

export async function POST(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const limit = await rateLimit(req, { key: 'event-certificate-download', limit: 20, windowMs: 10 * 60 * 1000 })
  if (!limit.ok) return limit.response

  const { eventId } = await params
  const body = await req.json().catch(() => ({}))
  const result = await loadCertificateContext(eventId, body.registration_code, body.contact_phone)
  if (!result.data) return NextResponse.json({ error: result.error }, { status: result.status ?? 400, headers: limit.headers })

  const rider = result.data.riders.find((item) => item.id === String(body.registration_item_id ?? ''))
  if (!rider) return NextResponse.json({ error: 'Rider tidak ditemukan pada pendaftaran ini.' }, { status: 404, headers: limit.headers })

  let templateUrl: URL
  try {
    templateUrl = new URL(result.data.templateUrl, req.url)
  } catch {
    return NextResponse.json({ error: 'URL template sertifikat tidak valid.' }, { status: 400, headers: limit.headers })
  }
  const requestOrigin = new URL(req.url).origin
  if (templateUrl.origin !== requestOrigin || !templateUrl.pathname.startsWith('/api/media/event-logos/')) {
    return NextResponse.json({ error: 'Template sertifikat harus diunggah melalui Event Settings.' }, { status: 409, headers: limit.headers })
  }

  const templateResponse = await fetch(templateUrl, { cache: 'no-store' })
  if (!templateResponse.ok) {
    return NextResponse.json({ error: 'Template sertifikat tidak dapat dimuat.' }, { status: 502, headers: limit.headers })
  }

  try {
    const pdf = await PDFDocument.create()
    const image = await pdf.embedPng(await templateResponse.arrayBuffer())
    const page = pdf.addPage([image.width, image.height])
    page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height })

    const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
    const regular = await pdf.embedFont(StandardFonts.Helvetica)
    const name = rider.name.trim().toUpperCase()
    const nameSize = fitText(name, image.width * 0.72, bold)
    const dark = rgb(0.12, 0.06, 0.03)
    const muted = rgb(0.27, 0.16, 0.09)
    const baseY = image.height * 0.44

    drawCentered(page, name, baseY, nameSize, bold, dark)
    drawCentered(page, rider.category.toUpperCase(), baseY - nameSize * 1.75, 18, bold, muted)
    drawCentered(page, `No. Plat ${rider.plate}`, baseY - nameSize * 2.75, 13, regular, muted)
    drawCentered(page, result.data.event.name.toUpperCase(), image.height * 0.14, 11, regular, muted)

    const bytes = await pdf.save()
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        ...limit.headers,
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="e-sertifikat-${sanitizeFilename(rider.name)}.pdf"`,
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (error) {
    console.error('[certificate-download] failed generating PDF:', error)
    return NextResponse.json({ error: 'PDF sertifikat gagal dibuat. Pastikan template PNG valid.' }, { status: 500, headers: limit.headers })
  }
}
