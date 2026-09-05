'use server'

import { adminClient } from '@/src/lib/auth'

export type ChecklistStatus = 'done' | 'warning' | 'todo'

export type ChecklistItem = {
  key: string
  label: string
  description: string
  status: ChecklistStatus
  href: string
  detail?: string
}

export async function getEventSetupChecklist(eventId: string): Promise<ChecklistItem[]> {
  const [
    { data: event },
    { data: settings },
    { count: enabledCatCount },
    { count: registrationCount },
    { count: penaltyCount },
    { data: catRules },
  ] = await Promise.all([
    adminClient.from('events').select('name, location, event_date, is_public').eq('id', eventId).single(),
    adminClient.from('event_settings').select('race_format_settings').eq('event_id', eventId).single(),
    adminClient
      .from('categories')
      .select('*', { count: 'exact', head: true })
      .eq('event_id', eventId)
      .eq('enabled', true),
    adminClient
      .from('registrations')
      .select('*', { count: 'exact', head: true })
      .eq('event_id', eventId),
    adminClient
      .from('rider_penalties')
      .select('*', { count: 'exact', head: true })
      .eq('event_id', eventId),
    adminClient
      .from('categories')
      .select('id')
      .eq('event_id', eventId)
      .eq('enabled', true),
  ])

  // Check race_category_rule per enabled category
  let categoriesWithRules = 0
  let categoriesWithFinalClasses = 0
  const totalEnabledCats = enabledCatCount ?? 0

  if (catRules && catRules.length > 0) {
    const catIds = catRules.map((c) => c.id)
    const { data: rules } = await adminClient
      .from('race_category_rule')
      .select('category_id, enabled_final_classes')
      .in('category_id', catIds)

    if (rules) {
      const rulesByCat = new Map(rules.map((r) => [r.category_id, r]))
      categoriesWithRules = catIds.filter((id) => rulesByCat.has(id)).length
      categoriesWithFinalClasses = catIds.filter((id) => {
        const rule = rulesByCat.get(id)
        if (!rule) return false
        const fc = rule.enabled_final_classes
        return Array.isArray(fc) ? fc.length > 0 : typeof fc === 'string' && fc.trim().length > 0
      }).length
    }
  }

  const raceFormatSettings = (settings?.race_format_settings ?? {}) as Record<string, unknown>
  const hasFinalClasses = Array.isArray(raceFormatSettings.final_classes)
    ? (raceFormatSettings.final_classes as string[]).length > 0
    : false
  const hasDrawMode = typeof raceFormatSettings.draw_mode === 'string' && raceFormatSettings.draw_mode.trim().length > 0
  const hasGatePositions = typeof raceFormatSettings.gate_positions === 'number' && raceFormatSettings.gate_positions > 0

  const items: ChecklistItem[] = []

  // 1. Info Event
  const infoOk = !!(event?.location && event?.event_date)
  items.push({
    key: 'event_info',
    label: 'Informasi Event',
    description: 'Nama, lokasi, dan tanggal event sudah terisi',
    status: infoOk ? 'done' : 'todo',
    href: `/admin/events/${eventId}/settings`,
    detail: !event?.location
      ? 'Lokasi belum diisi'
      : !event?.event_date
        ? 'Tanggal belum diisi'
        : undefined,
  })

  // 2. Kategori aktif
  const catOk = totalEnabledCats > 0
  items.push({
    key: 'categories',
    label: 'Kategori Aktif',
    description: 'Minimal 1 kategori telah diaktifkan',
    status: catOk ? 'done' : 'todo',
    href: `/admin/events/${eventId}/settings`,
    detail: catOk ? `${totalEnabledCats} kategori aktif` : 'Belum ada kategori yang diaktifkan',
  })

  // 3. Race Format (draw mode & gate)
  const raceFormatOk = hasDrawMode && hasGatePositions
  items.push({
    key: 'race_format',
    label: 'Race Format',
    description: 'Draw mode dan jumlah gate sudah dikonfigurasi',
    status: raceFormatOk ? 'done' : !hasDrawMode && !hasGatePositions ? 'todo' : 'warning',
    href: `/admin/events/${eventId}/settings`,
    detail: !hasDrawMode
      ? 'Draw mode belum dipilih'
      : !hasGatePositions
        ? 'Jumlah gate belum diisi'
        : `Draw: ${raceFormatSettings.draw_mode}, Gate: ${raceFormatSettings.gate_positions}`,
  })

  // 4. Final Class Rules (dari event settings race_format_settings.final_classes)
  const finalClassOk = hasFinalClasses
  const finalClassList = Array.isArray(raceFormatSettings.final_classes)
    ? (raceFormatSettings.final_classes as string[]).join(', ')
    : ''
  items.push({
    key: 'final_classes',
    label: 'Final Class Rules',
    description: 'Urutan dan daftar Final Class sudah dikonfigurasi di Race Format',
    status: finalClassOk ? 'done' : 'todo',
    href: `/admin/events/${eventId}/settings`,
    detail: finalClassOk
      ? `${(raceFormatSettings.final_classes as string[]).length} kelas: ${finalClassList}`
      : 'Final class belum dikonfigurasi di Race Format',
  })

  // 5. Race Category Rule per kategori
  const ruleCoverage =
    totalEnabledCats === 0
      ? 'done'
      : categoriesWithRules === totalEnabledCats
        ? 'done'
        : categoriesWithRules > 0
          ? 'warning'
          : 'todo'
  items.push({
    key: 'category_rules',
    label: 'Race Category Rules',
    description: 'Setiap kategori aktif memiliki aturan race (stages & final classes)',
    status: ruleCoverage as ChecklistStatus,
    href: `/admin/events/${eventId}/advanced-race`,
    detail:
      totalEnabledCats === 0
        ? 'Belum ada kategori aktif'
        : `${categoriesWithRules}/${totalEnabledCats} kategori sudah dikonfigurasi`,
  })

  // 6. Registrasi
  const regOk = (registrationCount ?? 0) > 0
  items.push({
    key: 'registrations',
    label: 'Data Registrasi',
    description: 'Minimal 1 rider sudah terdaftar di event ini',
    status: regOk ? 'done' : 'todo',
    href: `/admin/events/${eventId}/registrations`,
    detail: regOk ? `${registrationCount} registrasi` : 'Belum ada registrasi',
  })

  // 7. Penalties (optional — warning if none, not todo)
  const hasPenalties = (penaltyCount ?? 0) > 0
  items.push({
    key: 'penalties',
    label: 'Penalti Rider',
    description: 'Data penalti rider di event ini (opsional)',
    status: hasPenalties ? 'done' : 'warning',
    href: `/admin/events/${eventId}/penalties`,
    detail: hasPenalties ? `${penaltyCount} penalti tercatat` : 'Belum ada penalti (opsional)',
  })

  // 8. Event dipublikasi
  const isPublic = event?.is_public === true
  items.push({
    key: 'published',
    label: 'Event Dipublikasi',
    description: 'Event sudah dipublikasi dan terlihat oleh publik',
    status: isPublic ? 'done' : 'warning',
    href: `/admin/events/${eventId}/settings`,
    detail: isPublic ? 'Event sudah publik' : 'Event masih tersembunyi dari publik',
  })

  return items
}
