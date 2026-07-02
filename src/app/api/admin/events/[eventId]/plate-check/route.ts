import { NextResponse } from 'next/server'
import { adminClient, requireBackoffice } from '../../../../../../lib/auth'
import { normalizePlateNumber, normalizePlateSuffix, suggestPlateSuffix } from '../../../../../../lib/plate'

export async function GET(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  const auth = await requireBackoffice(req.headers.get('authorization'), eventId)
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const plateNumber = normalizePlateNumber(searchParams.get('plate_number'), { maxDigits: 3 })
  const plateSuffix = normalizePlateSuffix(searchParams.get('plate_suffix'))

  if (!plateNumber) {
    return NextResponse.json({ error: 'plate_number must contain 1-3 digits only' }, { status: 400 })
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
      message: `Plate ${displayValue} siap dipakai.`,
    },
  })
}
