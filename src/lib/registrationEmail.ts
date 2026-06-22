import { adminClient } from './auth'
import type { BusinessSettings } from './eventService'
import { buildQrCodeUrl } from './publicLinks'

type RegistrationRow = {
  id: string
  registration_code: string | null
  community_name: string | null
  contact_name: string | null
  contact_phone: string | null
  contact_email: string | null
  total_amount: number | null
}

type RegistrationItemRow = {
  rider_name: string | null
  rider_nickname: string | null
  club: string | null
  primary_category_id: string | null
  extra_category_id: string | null
  jersey_size: string | null
  requested_plate_number: string | null
  requested_plate_suffix: string | null
  price: number | null
}

type CategoryRow = {
  id: string
  label: string | null
}

type EventRow = {
  name: string | null
  location: string | null
  event_date: string | null
}

type SettingsRow = {
  business_settings: BusinessSettings | null
}

export type RegistrationEmailResult =
  | { status: 'sent'; id?: string }
  | { status: 'skipped'; reason: string }

type RegistrationEmailKind = 'APPROVED' | 'REJECTED' | 'PAYMENT_REJECTED' | 'STATUS_ACCESS'

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

const resolveCommitteeContact = (business: BusinessSettings) => {
  const name =
    business.public_contact_name?.trim() ||
    business.operating_committee_contact_name?.trim() ||
    business.event_owner_contact_name?.trim() ||
    business.operating_committee_name?.trim() ||
    business.event_owner_name?.trim() ||
    'Panitia'
  const phone =
    business.public_contact_phone?.trim() ||
    business.operating_committee_contact_phone?.trim() ||
    business.event_owner_contact_phone?.trim() ||
    ''
  const email =
    business.public_contact_email?.trim() ||
    business.operating_committee_contact_email?.trim() ||
    business.event_owner_contact_email?.trim() ||
    ''

  return { name, phone, email }
}

export const sendRegistrationStatusEmail = async (
  eventId: string,
  registrationId: string,
  kind: RegistrationEmailKind,
  notes?: string | null
): Promise<RegistrationEmailResult> => {
  const apiKey = process.env.RESEND_API_KEY?.trim()
  const from = process.env.REGISTRATION_EMAIL_FROM?.trim()
  if (!apiKey) return { status: 'skipped', reason: 'RESEND_API_KEY belum diset.' }
  if (!from) return { status: 'skipped', reason: 'REGISTRATION_EMAIL_FROM belum diset.' }

  const { data: registration, error: registrationError } = await adminClient
    .from('registrations')
    .select('id, registration_code, community_name, contact_name, contact_phone, contact_email, total_amount')
    .eq('id', registrationId)
    .eq('event_id', eventId)
    .maybeSingle()

  if (registrationError) throw new Error(registrationError.message)
  const reg = registration as RegistrationRow | null
  if (!reg?.contact_email) return { status: 'skipped', reason: 'Email wali rider kosong.' }

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
        .select(
          'rider_name, rider_nickname, club, primary_category_id, extra_category_id, jersey_size, requested_plate_number, requested_plate_suffix, price'
        )
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
  const committeeContact = resolveCommitteeContact(business)
  const items = (itemRows ?? []) as RegistrationItemRow[]
  const categoryIds = Array.from(
    new Set(
      items
        .flatMap((item) => [item.primary_category_id, item.extra_category_id])
        .filter((id): id is string => Boolean(id))
    )
  )
  let categoryMap = new Map<string, string>()
  if (categoryIds.length > 0) {
    const { data: categoryRows, error: categoryError } = await adminClient
      .from('categories')
      .select('id, label')
      .in('id', categoryIds)

    if (categoryError) throw new Error(categoryError.message)
    categoryMap = new Map(
      ((categoryRows ?? []) as CategoryRow[]).map((category) => [category.id, category.label || category.id])
    )
  }
  const riderNames = items.map((item) => item.rider_name?.trim()).filter((name): name is string => Boolean(name))
  const riderSummary =
    riderNames.length === 0
      ? 'Rider'
      : riderNames.length === 1
      ? riderNames[0]
      : `${riderNames[0]} +${riderNames.length - 1} rider`
  const shortRegistrationId = reg.registration_code || reg.id.slice(0, 8).toUpperCase()
  const statusUrl = `https://racepushbike.com/registration-status?code=${encodeURIComponent(shortRegistrationId)}`
  const qrCodeUrl = buildQrCodeUrl(statusUrl, 240)

  const riderRows = items
    .map((item, index) => {
      const plate = `${item.requested_plate_number ?? '-'}${item.requested_plate_suffix ?? ''}`
      const primaryCategory = item.primary_category_id ? categoryMap.get(item.primary_category_id) ?? '-' : '-'
      const extraCategory = item.extra_category_id ? categoryMap.get(item.extra_category_id) ?? '-' : '-'
      return `
        <tr>
          <td style="padding:8px;border:1px solid #dbe3ef;">${index + 1}</td>
          <td style="padding:8px;border:1px solid #dbe3ef;font-weight:700;">${escapeHtml(item.rider_name)}</td>
          <td style="padding:8px;border:1px solid #dbe3ef;">${escapeHtml(item.rider_nickname || '-')}</td>
          <td style="padding:8px;border:1px solid #dbe3ef;">${escapeHtml(item.club || '-')}</td>
          <td style="padding:8px;border:1px solid #dbe3ef;">${escapeHtml(primaryCategory)}</td>
          <td style="padding:8px;border:1px solid #dbe3ef;">${escapeHtml(extraCategory)}</td>
          <td style="padding:8px;border:1px solid #dbe3ef;">${escapeHtml(plate)}</td>
          <td style="padding:8px;border:1px solid #dbe3ef;">${escapeHtml(item.jersey_size || '-')}</td>
          <td style="padding:8px;border:1px solid #dbe3ef;">${escapeHtml(formatRupiah(item.price))}</td>
        </tr>
      `
    })
    .join('')

  const isApproved = kind === 'APPROVED'
  const isPaymentRejected = kind === 'PAYMENT_REJECTED'
  const isStatusAccess = kind === 'STATUS_ACCESS'
  const title = isStatusAccess
    ? 'Akses status dan QR pendaftaran'
    : isApproved
    ? 'Pendaftaran telah dikonfirmasi'
    : isPaymentRejected
    ? 'Bukti pembayaran perlu diperbaiki'
    : 'Pendaftaran perlu ditinjau kembali'
  const intro = isStatusAccess
    ? `berikut kode registrasi, QR, dan akses status pendaftaran untuk <strong>${escapeHtml(eventTitle)}</strong>.`
    : isApproved
    ? `pendaftaran untuk <strong>${escapeHtml(eventTitle)}</strong> telah dikonfirmasi oleh panitia.`
    : isPaymentRejected
    ? `bukti pembayaran untuk pendaftaran <strong>${escapeHtml(eventTitle)}</strong> belum dapat dikonfirmasi. Silakan cek catatan dari panitia.`
    : `pendaftaran untuk <strong>${escapeHtml(eventTitle)}</strong> belum dapat dikonfirmasi. Silakan cek catatan dari panitia.`
  const statusLabel = isStatusAccess
    ? 'Silakan cek status terbaru melalui tombol atau QR di bawah'
    : isApproved
    ? 'Pendaftaran telah dikonfirmasi'
    : isPaymentRejected
    ? 'Bukti pembayaran perlu diperbaiki'
    : 'Perlu ditinjau / dilengkapi'
  const subject = isStatusAccess
    ? `Akses status & QR ${riderSummary} - ${eventTitle} #${shortRegistrationId}`
    : isApproved
    ? `Pendaftaran ${riderSummary} telah dikonfirmasi - ${eventTitle} #${shortRegistrationId}`
    : isPaymentRejected
    ? `Bukti pembayaran ${riderSummary} perlu diperbaiki - ${eventTitle} #${shortRegistrationId}`
    : `Pendaftaran ${riderSummary} perlu ditinjau - ${eventTitle} #${shortRegistrationId}`
  const noteBlock =
    !isApproved && !isStatusAccess && notes?.trim()
      ? `<div style="padding:12px;border:1px solid #fecdd3;border-radius:12px;background:#fff1f2;margin-bottom:16px;"><strong>Alasan:</strong><br/>${escapeHtml(
          notes.trim()
        )}</div>`
      : ''
  const whatsappButton =
    (isApproved || isStatusAccess) && whatsappUrl
      ? `<p style="margin:0 0 16px;"><a href="${escapeHtml(
          whatsappUrl
        )}" style="display:inline-block;padding:10px 14px;border-radius:10px;background:#16a34a;color:#fff;text-decoration:none;font-weight:700;">Gabung Grup WhatsApp</a></p>`
      : ''
  const contactBlock = `
    <div style="padding:12px;border:1px solid #dbe3ef;border-radius:12px;background:#fff;margin-bottom:16px;">
      <div><strong>Kontak Panitia:</strong> ${escapeHtml(committeeContact.name)}</div>
      ${committeeContact.phone ? `<div><strong>WhatsApp:</strong> ${escapeHtml(committeeContact.phone)}</div>` : ''}
      ${committeeContact.email ? `<div><strong>Email:</strong> ${escapeHtml(committeeContact.email)}</div>` : ''}
    </div>
  `

  const html = `
    <div style="font-family:Arial,sans-serif;color:#0f172a;line-height:1.5;">
      <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(
        `${title} untuk ${riderSummary}. Kode registrasi ${shortRegistrationId}.`
      )}</div>
      <h1 style="margin:0 0 8px;font-size:24px;">${escapeHtml(title)}</h1>
      <p style="margin:0 0 16px;">Halo ${escapeHtml(reg.contact_name || 'Kak')}, ${intro}</p>
      ${whatsappButton}
      <div style="padding:14px;border:1px solid #dbe3ef;border-radius:12px;background:#f8fafc;margin-bottom:16px;">
        <div><strong>Event:</strong> ${escapeHtml(eventTitle)}</div>
        <div><strong>Lokasi:</strong> ${escapeHtml(event?.location || '-')}</div>
        <div><strong>Tanggal:</strong> ${escapeHtml(event?.event_date || '-')}</div>
        <div><strong>Nomor WA:</strong> ${escapeHtml(reg.contact_phone || '-')}</div>
        <div><strong>Kode Registrasi:</strong> ${escapeHtml(shortRegistrationId)}</div>
        <div><strong>Total:</strong> ${escapeHtml(formatRupiah(reg.total_amount))}</div>
        <div><strong>Status:</strong> ${escapeHtml(statusLabel)}</div>
      </div>
      <div style="padding:16px;border:1px solid #fde68a;border-radius:14px;background:#fffbeb;margin-bottom:16px;text-align:center;">
        <div style="font-size:12px;font-weight:700;text-transform:uppercase;color:#92400e;margin-bottom:8px;">QR Pendaftaran</div>
        <img src="${escapeHtml(qrCodeUrl)}" width="200" height="200" alt="QR status pendaftaran ${escapeHtml(
          shortRegistrationId
        )}" style="display:block;width:200px;height:200px;margin:0 auto 10px;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:8px;" />
        <div style="font-size:14px;font-weight:700;margin-bottom:10px;">${escapeHtml(shortRegistrationId)}</div>
        <a href="${escapeHtml(
          statusUrl
        )}" style="display:inline-block;padding:10px 16px;border-radius:999px;background:#f3c63d;color:#1d0d07;text-decoration:none;font-weight:700;">Cek Status Pendaftaran</a>
        <p style="margin:10px 0 0;color:#6b7280;font-size:12px;">Nomor WhatsApp tetap diperlukan saat membuka status pendaftaran.</p>
      </div>
      ${noteBlock}
      <table style="border-collapse:collapse;width:100%;margin-bottom:16px;font-size:13px;">
        <thead>
          <tr style="background:#eaf2ff;">
            <th style="padding:8px;border:1px solid #dbe3ef;text-align:left;">#</th>
            <th style="padding:8px;border:1px solid #dbe3ef;text-align:left;">Rider</th>
            <th style="padding:8px;border:1px solid #dbe3ef;text-align:left;">Panggilan</th>
            <th style="padding:8px;border:1px solid #dbe3ef;text-align:left;">Komunitas</th>
            <th style="padding:8px;border:1px solid #dbe3ef;text-align:left;">Kategori Terdaftar</th>
            <th style="padding:8px;border:1px solid #dbe3ef;text-align:left;">Kategori Upclass</th>
            <th style="padding:8px;border:1px solid #dbe3ef;text-align:left;">Plate</th>
            <th style="padding:8px;border:1px solid #dbe3ef;text-align:left;">Jersey</th>
            <th style="padding:8px;border:1px solid #dbe3ef;text-align:left;">Biaya</th>
          </tr>
        </thead>
        <tbody>${riderRows}</tbody>
      </table>
      ${contactBlock}
      <p style="margin:0;color:#475569;font-size:12px;">Email otomatis dari ${escapeHtml(brandName)}.</p>
    </div>
  `

  const text = [
    title,
    `Event: ${eventTitle}`,
    `Lokasi: ${event?.location || '-'}`,
    `Tanggal: ${event?.event_date || '-'}`,
    `Kode Registrasi: ${shortRegistrationId}`,
    `Cek Status: ${statusUrl}`,
    `Total: ${formatRupiah(reg.total_amount)}`,
    `Status: ${statusLabel}`,
    !isApproved && !isStatusAccess && notes?.trim() ? `Alasan: ${notes.trim()}` : '',
    (isApproved || isStatusAccess) && whatsappUrl ? `Grup WhatsApp: ${whatsappUrl}` : '',
    `Kontak Panitia: ${committeeContact.name}`,
    committeeContact.phone ? `WhatsApp Panitia: ${committeeContact.phone}` : '',
    committeeContact.email ? `Email Panitia: ${committeeContact.email}` : '',
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
      subject,
      html,
      text,
    }),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`Failed sending registration email: ${response.status} ${body}`)
  }

  const body = (await response.json().catch(() => null)) as { id?: string } | null
  return { status: 'sent', id: body?.id }
}

export const sendRegistrationConfirmationEmail = (eventId: string, registrationId: string) =>
  sendRegistrationStatusEmail(eventId, registrationId, 'APPROVED')

export const sendRegistrationRejectionEmail = (eventId: string, registrationId: string, notes?: string | null) =>
  sendRegistrationStatusEmail(eventId, registrationId, 'REJECTED', notes)

export const sendRegistrationPaymentRejectionEmail = (eventId: string, registrationId: string, notes?: string | null) =>
  sendRegistrationStatusEmail(eventId, registrationId, 'PAYMENT_REJECTED', notes)

export const sendRegistrationStatusAccessEmail = (eventId: string, registrationId: string) =>
  sendRegistrationStatusEmail(eventId, registrationId, 'STATUS_ACCESS')
