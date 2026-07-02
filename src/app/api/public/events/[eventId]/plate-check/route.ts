import { NextResponse } from 'next/server'
import { adminClient } from '../../../../../../lib/auth'
import { normalizePlateNumber, normalizePlateSuffix, suggestPlateSuffix } from '../../../../../../lib/plate'
import { rateLimit } from '../../../../../../lib/rateLimit'

const PLATE_CHECK_LIMIT = {
  key: 'public-plate-check',
  limit: 60,
  windowMs: 60 * 1000,
}

export async function GET(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const limited = await rateLimit(req, PLATE_CHECK_LIMIT)
  if (!limited.ok) return limited.response

  const { eventId } = await params
  const { searchParams } = new URL(req.url)
  const plateNumber = normalizePlateNumber(searchParams.get('plate_number'), { maxDigits: 3 })
  const plateSuffix = normalizePlateSuffix(searchParams.get('plate_suffix'))

  if (!plateNumber) {
    return NextResponse.json({ error: 'plate_number must contain 1-3 digits only' }, { status: 400 })
  }

  const { data: event, error: eventError } = await adminClient
    .from('events')
    .select('id, is_public')
    .eq('id', eventId)
    .maybeSingle()

  if (eventError) return NextResponse.json({ error: eventError.message }, { status: 400 })
  if (!event || event.is_public === false) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  }

  const { data: existingPlates, error } = await adminClient
    .from('riders')
    .select('plate_suffix')
    .eq('event_id', eventId)
    .eq('plate_number', plateNumber)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  const { data: pendingItems, error: pendingError } = await adminClient
    .from('registration_items')
    .select('requested_plate_suffix, status, registrations!inner(event_id, status)')
    .eq('requested_plate_number', plateNumber)
    .eq('registrations.event_id', eventId)
    .neq('registrations.status', 'REJECTED')
    .neq('status', 'REJECTED')

  if (pendingError) return NextResponse.json({ error: pendingError.message }, { status: 400 })

  const usedSuffixes = [
    ...(existingPlates ?? []).map((row) =>
      typeof row.plate_suffix === 'string' && row.plate_suffix.trim() ? row.plate_suffix.trim().toUpperCase() : null
    ),
    ...(pendingItems ?? []).map((row) =>
      typeof row.requested_plate_suffix === 'string' && row.requested_plate_suffix.trim()
        ? row.requested_plate_suffix.trim().toUpperCase()
        : null
    ),
  ]
  const displayValue = `${plateNumber}${plateSuffix ?? ''}`

  if (usedSuffixes.length === 0) {
    return NextResponse.json({
      data: {
        available: true,
        status: 'available',
        display_value: displayValue,
        suggested_suffix: null,
        used_suffixes: [],
        message: `Nomor plate ${displayValue} saat ini masih tersedia.`,
      },
    })
  }

  const suggestion = suggestPlateSuffix(usedSuffixes)

  if (!plateSuffix) {
    return NextResponse.json({
      data: {
        available: false,
        status: 'needs_suffix',
        display_value: plateNumber,
        suggested_suffix: suggestion,
        used_suffixes: usedSuffixes.filter(Boolean),
        message: suggestion
          ? `Nomor plate ${plateNumber} sudah digunakan. Tambahkan huruf, misalnya ${suggestion}.`
          : `Nomor plate ${plateNumber} sudah digunakan dan semua suffix A-Z sudah terpakai.`,
      },
    })
  }

  if (usedSuffixes.includes(plateSuffix)) {
    return NextResponse.json({
      data: {
        available: false,
        status: 'suffix_taken',
        display_value: displayValue,
        suggested_suffix: suggestion,
        used_suffixes: usedSuffixes.filter(Boolean),
        message: suggestion
          ? `Plate ${displayValue} sudah digunakan. Coba suffix ${suggestion}.`
          : `Plate ${displayValue} sudah digunakan dan belum ada suffix lain yang tersedia.`,
      },
    })
  }

  return NextResponse.json({
    data: {
      available: true,
      status: 'available',
      display_value: displayValue,
      suggested_suffix: null,
      used_suffixes: usedSuffixes.filter(Boolean),
      message: `Plate ${displayValue} siap diajukan.`,
    },
  })
}
