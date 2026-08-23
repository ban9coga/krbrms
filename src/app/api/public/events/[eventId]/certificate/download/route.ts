import { NextResponse } from 'next/server'
import { PDFDocument, rgb } from 'pdf-lib'
import QRCode from 'qrcode'
import { issueCertificate, type CertificateContext, type CertificateRider, type CertificateType } from '@/src/lib/eventCertificate'
import { readCertificateAccessToken } from '@/src/lib/certificateAccessToken'
import { rateLimit } from '@/src/lib/rateLimit'
import { embedCertificateFonts } from '@/src/lib/certificateFonts'

export const runtime = 'nodejs'

type PdfPage = {
  drawText: (text: string, options: Record<string, unknown>) => void
  drawImage: (image: unknown, options: Record<string, unknown>) => void
  getWidth: () => number
  getHeight: () => number
}

type Font = { widthOfTextAtSize: (value: string, size: number) => number }

const fitText = (text: string, maxWidth: number, font: Font, maxSize: number) => {
  for (let size = maxSize; size >= 6; size -= 1) if (font.widthOfTextAtSize(text, size) <= maxWidth) return size
  return 6
}

const sanitizeFilename = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'rider'

const formatEventDate = (value: string | null) => {
  if (!value) return '-'
  const date = new Date(`${value}T00:00:00`)
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'long', year: 'numeric' }).format(date)
}

const localImageUrl = (value: string | null, requestOrigin: string) => {
  if (!value) return null
  try {
    const url = new URL(value, requestOrigin)
    return url.origin === requestOrigin && url.pathname.startsWith('/api/media/event-logos/') ? url : null
  } catch {
    return null
  }
}

const fetchPng = async (url: URL | null) => {
  if (!url) return null
  const response = await fetch(url, {
    // Upload paths include a unique filename (or version query), so a long-lived
    // cache never serves a replaced certificate template or logo.
    cache: 'force-cache',
    next: { revalidate: 31_536_000 },
  })
  return response.ok ? response.arrayBuffer() : null
}

const drawCenteredText = (page: PdfPage, value: string, xPercent: number, topPercent: number, widthPercent: number, maxSize: number, font: Font, color: ReturnType<typeof rgb>) => {
  const width = page.getWidth()
  const size = fitText(value, width * (widthPercent / 100), font, maxSize)
  const x = width * (xPercent / 100) - font.widthOfTextAtSize(value, size) / 2
  const y = page.getHeight() * (1 - topPercent / 100)
  page.drawText(value, { x, y, size, font, color })
}

const drawImageAt = (page: PdfPage, image: unknown, xPercent: number, topPercent: number, widthPercent: number) => {
  const width = page.getWidth() * (widthPercent / 100)
  const x = page.getWidth() * (xPercent / 100) - width / 2
  const y = page.getHeight() * (1 - topPercent / 100) - width
  page.drawImage(image, { x, y, width, height: width })
}

const certificateType = (value: unknown): CertificateType | null => (value === 'ACHIEVEMENT' || value === 'PARTICIPATION' ? value : null)

const achievementValue = (rider: CertificateRider, type: CertificateType) => (type === 'ACHIEVEMENT' ? rider.achievement?.label || 'Prestasi final' : 'Peserta')

const renderCertificate = async (
  context: CertificateContext,
  rider: CertificateRider,
  type: CertificateType,
  code: string,
  requestOrigin: string
) => {
  const template = localImageUrl(context.templateUrl, requestOrigin)
  if (!template) throw new Error('Template sertifikat harus diunggah melalui Event Settings.')
  const assetUrls = {
    eventLogo: localImageUrl(context.assets.eventLogoUrl, requestOrigin),
    organizerLogo: localImageUrl(context.assets.organizerLogoUrl, requestOrigin),
  }
  const assetEntries = Object.entries(assetUrls) as Array<[keyof typeof assetUrls, URL | null]>
  const [templateBytes, assetBytes] = await Promise.all([
    fetchPng(template),
    Promise.all(assetEntries.map(async ([key, url]) => [key, await fetchPng(url)] as const)),
  ])
  if (!templateBytes) throw new Error('Template sertifikat tidak dapat dimuat.')

  const pdf = await PDFDocument.create()
  const templateImage = await pdf.embedPng(templateBytes)
  const page = pdf.addPage([templateImage.width, templateImage.height]) as unknown as PdfPage
  page.drawImage(templateImage, { x: 0, y: 0, width: templateImage.width, height: templateImage.height })
  const fontsPromise = embedCertificateFonts(pdf)
  const verifyUrl = `${requestOrigin}/certificate/verify/${encodeURIComponent(code)}`
  const [fonts, qrDataUrl] = await Promise.all([
    fontsPromise,
    QRCode.toDataURL(verifyUrl, { errorCorrectionLevel: 'M', margin: 1, width: 480 }),
  ])
  const dark = rgb(0.12, 0.06, 0.03)
  const orange = rgb(0.86, 0.22, 0.04)
  const muted = rgb(0.27, 0.16, 0.09)
  const values = {
    name: rider.name.trim().toUpperCase(),
    eventName: context.event.name.trim().toUpperCase(),
    category: rider.category,
    plate: rider.plate,
    achievement: achievementValue(rider, type),
    eventDate: formatEventDate(context.event.event_date),
    location: context.event.location || '-',
    certificateCode: code,
  }
  const layout = context.layout
  ;(['name', 'eventName', 'category', 'plate', 'achievement', 'eventDate', 'location', 'certificateCode'] as const).forEach((key) => {
    const position = layout.text[key]
    drawCenteredText(
      page,
      values[key],
      position.x,
      position.top,
      position.width,
      position.fontSize,
      fonts[position.font],
      key === 'eventName' || key === 'certificateCode' ? orange : key === 'name' ? dark : muted
    )
  })

  const qrImage = await pdf.embedPng(Buffer.from(qrDataUrl.split(',')[1], 'base64'))
  drawImageAt(page, qrImage, layout.image.qr.x, layout.image.qr.top, layout.image.qr.width)
  for (const [key, bytes] of assetBytes) {
    if (!bytes) continue
    const image = await pdf.embedPng(bytes)
    const position = layout.image[key]
    drawImageAt(page, image, position.x, position.top, position.width)
  }

  return pdf.save()
}

export async function POST(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const limit = await rateLimit(req, { key: 'event-certificate-download', limit: 20, windowMs: 10 * 60 * 1000 })
  if (!limit.ok) return limit.response
  const { eventId } = await params
  const body = await req.json().catch(() => ({}))
  const type = certificateType(body.certificate_type) ?? 'PARTICIPATION'
  const access = readCertificateAccessToken(body.access_token)
  if (!access || access.context.event.id !== eventId) {
    return NextResponse.json({ error: 'Sesi verifikasi sertifikat sudah habis. Silakan verifikasi ulang.' }, { status: 401, headers: limit.headers })
  }
  const rider = access.context.riders.find((item) => item.id === String(body.registration_item_id ?? ''))
  if (!rider) return NextResponse.json({ error: 'Rider tidak ditemukan pada pendaftaran ini.' }, { status: 404, headers: limit.headers })

  const issued = await issueCertificate(access.context, rider, type)
  if (!issued.data) return NextResponse.json({ error: issued.error || 'Certificate ID gagal dibuat.' }, { status: 500, headers: limit.headers })
  if (issued.data.revokedAt) return NextResponse.json({ error: 'Sertifikat ini sudah dicabut oleh panitia.' }, { status: 410, headers: limit.headers })

  try {
    const requestOrigin = new URL(req.url).origin
    const bytes = await renderCertificate(access.context, rider, type, issued.data.code, requestOrigin)
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        ...limit.headers,
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="e-sertifikat-${sanitizeFilename(rider.name)}-${type.toLowerCase()}.pdf"`,
        'Cache-Control': 'private, no-store',
        'X-Certificate-Code': issued.data.code,
      },
    })
  } catch (error) {
    console.error('[certificate-download] failed generating PDF:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'PDF sertifikat gagal dibuat.' }, { status: 500, headers: limit.headers })
  }
}
