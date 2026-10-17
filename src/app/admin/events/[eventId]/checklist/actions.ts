'use server'

import { adminClient } from '@/src/lib/auth'

export type ChecklistStatus = 'done' | 'warning' | 'todo'

export type ChecklistItem = {
  key: string
  step: number
  label: string
  description: string
  status: ChecklistStatus
  href: string
  detail: string
  required: boolean
  action: string
}

export async function getEventSetupChecklist(eventId: string): Promise<ChecklistItem[]> {
  const [
    { data: event },
    { data: settings },
    { data: categories },
    { count: registrationCount },
    { data: riders },
    { data: riderExtraCategories },
    { count: penaltyRuleCount },
    { data: crewRoles },
    { data: motos },
  ] = await Promise.all([
    adminClient.from('events').select('name, location, event_date, is_public').eq('id', eventId).maybeSingle(),
    adminClient.from('event_settings').select('race_format_settings').eq('event_id', eventId).maybeSingle(),
    adminClient.from('categories').select('id, year, year_min, year_max, gender').eq('event_id', eventId).eq('enabled', true),
    adminClient.from('registrations').select('id', { count: 'exact', head: true }).eq('event_id', eventId),
    adminClient.from('riders').select('id, primary_category_id, birth_year, gender').eq('event_id', eventId),
    adminClient.from('rider_extra_categories').select('rider_id, category_id').eq('event_id', eventId),
    adminClient.from('event_penalty_rules').select('id', { count: 'exact', head: true }).eq('event_id', eventId).eq('is_active', true),
    adminClient.from('user_event_roles').select('role').eq('event_id', eventId).eq('is_active', true),
    adminClient.from('motos').select('id, category_id, moto_name').eq('event_id', eventId),
  ])

  const enabledCategories = categories ?? []
  const categoryIds = enabledCategories.map((category) => category.id)
  const riderRows = riders ?? []
  const motoRows = motos ?? []
  const format = (settings?.race_format_settings ?? {}) as Record<string, unknown>
  const hasDrawMode = typeof format.draw_mode === 'string' && format.draw_mode.trim().length > 0
  const hasGateCount = typeof format.gate_positions === 'number' && format.gate_positions > 0
  const configuredFinalClasses = Array.isArray(format.final_classes) ? format.final_classes : []
  const moto1Rows = motoRows.filter((moto) => /^Moto 1\b/i.test(moto.moto_name))

  let ruleCategoryIds = new Set<string>()
  let categoryRuleDetails = new Map<string, { finalClasses: boolean }>()
  if (categoryIds.length > 0) {
    const { data: rules } = await adminClient
      .from('race_category_rule')
      .select('category_id, enabled_final_classes')
      .in('category_id', categoryIds)
    categoryRuleDetails = new Map(
      (rules ?? []).map((rule) => [rule.category_id, {
        finalClasses: Array.isArray(rule.enabled_final_classes)
          ? rule.enabled_final_classes.length > 0
          : typeof rule.enabled_final_classes === 'string' && rule.enabled_final_classes.trim().length > 0,
      }])
    )
    ruleCategoryIds = new Set(categoryRuleDetails.keys())
  }

  let assignedPairs = new Set<string>()
  let gatedPairs = new Set<string>()
  if (moto1Rows.length > 0) {
    const motoCategoryById = new Map(moto1Rows.map((moto) => [moto.id, moto.category_id]))
    const motoIds = moto1Rows.map((moto) => moto.id)
    const [{ data: placements }, { data: gateRows }] = await Promise.all([
      adminClient.from('moto_riders').select('moto_id, rider_id').in('moto_id', motoIds),
      adminClient.from('moto_gate_positions').select('moto_id, rider_id').in('moto_id', motoIds),
    ])
    assignedPairs = new Set((placements ?? []).flatMap((placement) => {
      const categoryId = motoCategoryById.get(placement.moto_id)
      return categoryId ? [`${categoryId}:${placement.rider_id}`] : []
    }))
    gatedPairs = new Set((gateRows ?? []).flatMap((placement) => {
      const categoryId = motoCategoryById.get(placement.moto_id)
      return categoryId ? [`${categoryId}:${placement.rider_id}`] : []
    }))
  }

  const expectedPairs = new Set<string>()
  for (const rider of riderRows) {
    if (rider.primary_category_id && categoryIds.includes(rider.primary_category_id)) {
      expectedPairs.add(`${rider.primary_category_id}:${rider.id}`)
      continue
    }
    if (rider.primary_category_id) continue
    for (const category of enabledCategories) {
      const minYear = category.year_min ?? category.year
      const maxYear = category.year_max ?? category.year
      const matchesYear = rider.birth_year >= minYear && rider.birth_year <= maxYear
      const matchesGender = category.gender === 'MIX' || rider.gender === category.gender
      if (matchesYear && matchesGender) expectedPairs.add(`${category.id}:${rider.id}`)
    }
  }
  for (const extra of riderExtraCategories ?? []) {
    if (categoryIds.includes(extra.category_id)) expectedPairs.add(`${extra.category_id}:${extra.rider_id}`)
  }
  const assignedCount = [...expectedPairs].filter((pair) => assignedPairs.has(pair)).length
  const gateCount = [...expectedPairs].filter((pair) => gatedPairs.has(pair)).length
  const allExpectedDrawn = expectedPairs.size > 0 && assignedCount === expectedPairs.size && gateCount === expectedPairs.size
  const roleSet = new Set((crewRoles ?? []).map((row) => String(row.role).toUpperCase()))
  const hasRaceCrew = ['CHECKER', 'FINISHER', 'RACE_DIRECTOR', 'RACE_CONTROL'].some((role) => roleSet.has(role))
  const hasRaceFormatFallback = configuredFinalClasses.length > 0
  const rulesComplete = categoryIds.length > 0 && categoryIds.every((id) => ruleCategoryIds.has(id) || hasRaceFormatFallback)
  const ruleCount = categoryIds.filter((id) => ruleCategoryIds.has(id)).length

  const items: ChecklistItem[] = [
    {
      key: 'event_info', step: 1, label: 'Informasi event',
      description: 'Pastikan lokasi dan tanggal event benar.',
      status: event?.location && event?.event_date ? 'done' : 'todo',
      href: `/admin/events/${eventId}/settings`,
      detail: !event?.location ? 'Lokasi belum diisi' : !event?.event_date ? 'Tanggal belum diisi' : `${event.location} - ${event.event_date}`,
      required: true, action: 'Lengkapi event',
    },
    {
      key: 'categories', step: 2, label: 'Kategori lomba',
      description: 'Aktifkan kategori yang akan dipakai di event.',
      status: enabledCategories.length > 0 ? 'done' : 'todo',
      href: `/admin/events/${eventId}/categories`,
      detail: enabledCategories.length ? `${enabledCategories.length} kategori aktif` : 'Belum ada kategori aktif',
      required: true, action: 'Atur kategori',
    },
    {
      key: 'riders', step: 3, label: 'Data rider',
      description: 'Setujui pendaftaran atau masukkan rider sebelum drawing.',
      status: riderRows.length > 0 ? 'done' : registrationCount ? 'warning' : 'todo',
      href: `/admin/events/${eventId}/registrations`,
      detail: riderRows.length ? `${riderRows.length} rider siap dikelola${registrationCount ? ` - ${registrationCount} pendaftaran` : ''}` : registrationCount ? `${registrationCount} pendaftaran masuk, belum ada rider di data event` : 'Belum ada rider atau pendaftaran',
      required: true, action: 'Kelola pendaftaran',
    },
    {
      key: 'race_format', step: 4, label: 'Format race',
      description: 'Tentukan mode drawing dan jumlah gate.',
      status: hasDrawMode && hasGateCount ? 'done' : !hasDrawMode && !hasGateCount ? 'todo' : 'warning',
      href: `/admin/events/${eventId}/draw-settings`,
      detail: hasDrawMode && hasGateCount ? `${format.draw_mode === 'external_draw' ? 'External draw' : 'Live draw'} - ${format.gate_positions} gate` : !hasDrawMode ? 'Mode drawing belum dipilih' : 'Jumlah gate belum dikonfigurasi',
      required: true, action: 'Atur format',
    },
    {
      key: 'category_rules', step: 5, label: 'Aturan race kategori',
      description: 'Periksa aturan stage untuk setiap kategori aktif.',
      status: rulesComplete ? 'done' : ruleCount > 0 ? 'warning' : 'todo',
      href: `/admin/events/${eventId}/advanced-race`,
      detail: !categoryIds.length
        ? 'Tambahkan kategori terlebih dahulu'
        : hasRaceFormatFallback && ruleCount < categoryIds.length
          ? `${ruleCount}/${categoryIds.length} aturan khusus; kategori lainnya memakai fallback ${configuredFinalClasses.length} Final Class dari Race Format`
          : `${ruleCount}/${categoryIds.length} kategori memiliki aturan khusus`,
      required: true, action: 'Periksa aturan race',
    },
    {
      key: 'drawing', step: 6, label: 'Drawing batch & gate',
      description: 'Buat batch Moto 1 dan pastikan rider mendapat gate.',
      status: allExpectedDrawn ? 'done' : assignedCount > 0 ? 'warning' : 'todo',
      href: `/admin/events/${eventId}/live-draw`,
      detail: expectedPairs.size ? `${assignedCount}/${expectedPairs.size} penempatan - ${gateCount}/${expectedPairs.size} gate terisi` : moto1Rows.length ? 'Belum ada rider aktif yang cocok dengan kategori drawing' : 'Moto 1 belum dibuat',
      required: true, action: 'Buka drawing',
    },
    {
      key: 'crew', step: 7, label: 'Akun crew race',
      description: 'Assign petugas checker, finisher, atau race director.',
      status: hasRaceCrew ? 'done' : 'warning',
      href: `/admin/events/${eventId}/settings`,
      detail: hasRaceCrew ? 'Petugas race sudah ditugaskan' : 'Belum ada role petugas race (bisa ditambahkan nanti)',
      required: false, action: 'Kelola crew',
    },
    {
      key: 'final_classes', step: 8, label: 'Final class',
      description: 'Konfigurasi pembagian kelas final bila format event memakainya.',
      status: configuredFinalClasses.length > 0 || categoryIds.some((id) => categoryRuleDetails.get(id)?.finalClasses) ? 'done' : 'warning',
      href: `/admin/events/${eventId}/custom-final-split`,
      detail: configuredFinalClasses.length ? `${configuredFinalClasses.length} kelas final dikonfigurasi` : 'Belum dikonfigurasi (sesuaikan dengan format event)',
      required: false, action: 'Atur final class',
    },
    {
      key: 'penalties', step: 9, label: 'Penalti',
      description: 'Isi standar penalti jika event menggunakan penalti khusus.',
      status: (penaltyRuleCount ?? 0) > 0 ? 'done' : 'warning',
      href: `/admin/events/${eventId}/penalties`,
      detail: (penaltyRuleCount ?? 0) > 0 ? `${penaltyRuleCount} rule penalti aktif` : 'Belum ada rule penalti aktif (opsional)',
      required: false, action: 'Atur penalti',
    },
    {
      key: 'published', step: 10, label: 'Publikasi event',
      description: 'Atur visibilitas bila event perlu tampil di halaman publik.',
      status: event?.is_public ? 'done' : 'warning',
      href: `/admin/events/${eventId}/settings`,
      detail: event?.is_public ? 'Event tampil untuk publik' : 'Event masih internal / tersembunyi',
      required: false, action: 'Atur publikasi',
    },
  ]

  return items
}
