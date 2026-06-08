import { adminClient } from './auth'
import type { BusinessSettings } from './eventService'

type RegistrationRow = {
  id: string
  community_name: string | null
  contact_name: string | null
  contact_phone: string | null
  contact_email: string | null
  total_amount: number | null
}

type RegistrationItemRow = {
  rider_name: string | null
  rider_nickname: string | null
  jersey_size: string | null
  requested_plate_number: string | null
  requested_plate_suffix: string | null
  price: number | null
}

type EventRow = {
  name: string | null
  location: string | null
  event_date: string | null
}

type SettingsRow = {
  business_settings: BusinessSettings | null
}

const escapeHtml = (value: unknown) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const formatRupiah = (value: number | null | undefined) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(
    Number(value) || 0
  )

const normalizeExternalUrl = (value?: string | null) => {
  const raw = value?.trim()
  if (!raw) return ''
  if (/^https?:\/\//i.test(raw)) return raw
  return `https://${raw}`
}

const getBusinessSettings = (value: unknown): BusinessSettings => {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as BusinessSettings
  return {}
}

export const sendRegistrationConfirmationEmail = async (eventId: string, registrationId: string) => {
  const apiKey = process.env.RESEND_API_KEY?.trim()
  const from = process.env.REGISTRATION_EMAIL_FROM?.trim()
  if (!apiKey || !from) return

  const { data: registration, error: registrationError } = await adminClient
    .from('registrations')
    .select('id, community_name, contact_name, contact_phone, contact_email, total_amount')
    .eq('id', registrationId)
    .eq('event_id', eventId)
    .maybeSingle()

  if (registrationError) throw new Error(registrationError.message)
  const reg = registration as RegistrationRow | null
  if (!reg?.contact_email) return

  const [{ data: eventRow, error: eventError }, { data: settingsRows, error: settingsError }, { data: itemRows, error: itemError }] =
    await Promise.all([
      adminClient.from('events').select('name, location, event_date').eq('id', eventId).maybeSingle(),
      adminClient
        .from('event_settings')
        .select('business_settings')
        .eq('event_id', eventId)
        .order('updated_at', { ascending: false })
        .limit(1),
      adminClient
        .from('registration_items')
        .select('rider_name, rider_nickname, jersey_size, requested_plate_number, requested_plate_suffix, price')
        .eq('registration_id', registrationId)
        .order('created_at', { ascending: true }),
    ])

  if (eventError) throw new Error(eventError.message)
  if (settingsError) throw new Error(settingsError.message)
  if (itemError) throw new Error(itemError.message)

  const event = eventRow as EventRow | null
  const settings = ((settingsRows ?? [])[0] ?? null) as SettingsRow | null
  const business = getBusinessSettings(settings?.business_settings)
  const eventTitle = business.public_event_title?.trim() || event?.name || 'Event Pushbike'
  const brandName = business.public_brand_name?.trim() || eventTitle
  const whatsappUrl = normalizeExternalUrl(business.whatsapp_group_invite_url)
  const items = (itemRows ?? []) as RegistrationItemRow[]

  const riderRows = items
    .map((item, index) => {
      const plate = `${item.requested_plate_number ?? '-'}${item.requested_plate_suffix ?? ''}`
      return `
        <tr>
          <td style="padding:8px;border:1px solid #dbe3ef;">${index + 1}</td>
          <td style="padding:8px;border:1px solid #dbe3ef;font-weight:700;">${escapeHtml(item.rider_name)}</td>
          <td style="padding:8px;border:1px solid #dbe3ef;">${escapeHtml(item.rider_nickname || '-')}</td>
          <td style="padding:8px;border:1px solid #dbe3ef;">${escapeHtml(plate)}</td>
          <td style="padding:8px;border:1px solid #dbe3ef;">${escapeHtml(item.jersey_size || '-')}</td>
          <td style="padding:8px;border:1px solid #dbe3ef;">${escapeHtml(formatRupiah(item.price))}</td>
        </tr>
      `
    })
    .join('')

  const html = `
    <div style="font-family:Arial,sans-serif;color:#0f172a;line-height:1.5;">
      <h1 style="margin:0 0 8px;font-size:24px;">Pendaftaran terverifikasi</h1>
      <p style="margin:0 0 16px;">Halo ${escapeHtml(reg.contact_name || 'Kak')}, pendaftaran untuk <strong>${escapeHtml(
        eventTitle
      )}</strong> sudah diverifikasi dan disetujui panitia.</p>
      <div style="padding:14px;border:1px solid #dbe3ef;border-radius:12px;background:#f8fafc;margin-bottom:16px;">
        <div><strong>Event:</strong> ${escapeHtml(eventTitle)}</div>
        <div><strong>Lokasi:</strong> ${escapeHtml(event?.location || '-')}</div>
        <div><strong>Tanggal:</strong> ${escapeHtml(event?.event_date || '-')}</div>
        <div><strong>Komunitas:</strong> ${escapeHtml(reg.community_name || '-')}</div>
        <div><strong>Nomor WA:</strong> ${escapeHtml(reg.contact_phone || '-')}</div>
        <div><strong>Total:</strong> ${escapeHtml(formatRupiah(reg.total_amount))}</div>
        <div><strong>Status:</strong> Pendaftaran disetujui panitia</div>
      </div>
      <table style="border-collapse:collapse;width:100%;margin-bottom:16px;font-size:13px;">
        <thead>
          <tr style="background:#eaf2ff;">
            <th style="padding:8px;border:1px solid #dbe3ef;text-align:left;">#</th>
            <th style="padding:8px;border:1px solid #dbe3ef;text-align:left;">Rider</th>
            <th style="padding:8px;border:1px solid #dbe3ef;text-align:left;">Panggilan</th>
            <th style="padding:8px;border:1px solid #dbe3ef;text-align:left;">Plate</th>
            <th style="padding:8px;border:1px solid #dbe3ef;text-align:left;">Jersey</th>
            <th style="padding:8px;border:1px solid #dbe3ef;text-align:left;">Biaya</th>
          </tr>
        </thead>
        <tbody>${riderRows}</tbody>
      </table>
      ${
        whatsappUrl
          ? `<p style="margin:0 0 16px;"><a href="${escapeHtml(
              whatsappUrl
            )}" style="display:inline-block;padding:10px 14px;border-radius:10px;background:#16a34a;color:#fff;text-decoration:none;font-weight:700;">Gabung Grup WhatsApp</a></p>`
          : ''
      }
      <p style="margin:0;color:#475569;font-size:12px;">Email otomatis dari ${escapeHtml(brandName)}.</p>
    </div>
  `

  const text = [
    'Pendaftaran terverifikasi',
    `Event: ${eventTitle}`,
    `Lokasi: ${event?.location || '-'}`,
    `Tanggal: ${event?.event_date || '-'}`,
    `Komunitas: ${reg.community_name || '-'}`,
    `Total: ${formatRupiah(reg.total_amount)}`,
    'Status: Pendaftaran disetujui panitia',
    whatsappUrl ? `Grup WhatsApp: ${whatsappUrl}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: reg.contact_email,
      subject: `Pendaftaran ${eventTitle} terverifikasi`,
      html,
      text,
    }),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`Failed sending registration email: ${response.status} ${body}`)
  }
}
