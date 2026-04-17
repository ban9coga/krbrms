import { NextResponse } from 'next/server'
import { adminClient, requireAdmin } from '../../../../../../lib/auth'

const suggestSuffix = (used: Array<string | null>) => {
  const existing = new Set(used.filter(Boolean) as string[])
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')
  for (const letter of alphabet) {
    if (!existing.has(letter)) return letter
  }
  return null
}

const normalizePlateNumber = (value: unknown) => {
  if (value === undefined || value === null) return null
  const raw = String(value).trim()
  if (!raw) return null
  if (!/^\d+$/.test(raw)) return null
  return raw
}

const normalizePlateSuffix = (value: unknown) => {
  if (value === undefined || value === null) return null
  const raw = String(value).trim().toUpperCase()
  if (!raw) return null
  const normalized = raw[0]
  return /^[A-Z]$/.test(normalized) ? normalized : null
}

export async function GET(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  const auth = await requireAdmin(req.headers.get('authorization'), eventId)
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const plateNumber = normalizePlateNumber(searchParams.get('plate_number'))
  const plateSuffix = normalizePlateSuffix(searchParams.get('plate_suffix'))

  if (!plateNumber) {
    return NextResponse.json({ error: 'plate_number must contain digits only' }, { status: 400 })
  }

  const { data: existingPlates, error } = await adminClient
    .from('riders')
    .select('plate_suffix')
    .eq('event_id', eventId)
    .eq('plate_number', plateNumber)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  const usedSuffixes = (existingPlates ?? []).map((row) =>
    typeof row.plate_suffix === 'string' && row.plate_suffix.trim() ? row.plate_suffix.trim().toUpperCase() : null
  )
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

  const suggestion = suggestSuffix(usedSuffixes)

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
      message: `Plate ${displayValue} siap dipakai.`,
    },
  })
}
