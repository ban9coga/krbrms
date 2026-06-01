import { randomUUID } from 'crypto'
import { NextResponse } from 'next/server'
import { adminClient, requireAdmin } from '../../../../../lib/auth'
import { normalizeEventMotoSequence } from '../../../../../services/motoSequenceNormalizer'

const buildInsertRows = <T,>(
  rows: T[] | null | undefined,
  mapRow: (row: T) => Record<string, unknown> | null
) => (rows ?? []).map(mapRow).filter((row): row is Record<string, unknown> => Boolean(row))

const toRecordArray = (value: unknown): Record<string, unknown>[] => {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
}

const toRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

const normalizePlateNumber = (value: unknown) => {
  const text = typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim()
  return text || null
}

const normalizePlateSuffix = (value: unknown) => {
  if (typeof value !== 'string') return null
  const text = value.trim().toUpperCase()
  return text ? text.slice(0, 1) : null
}

const nextAvailablePlateSuffix = (used: Set<string>) => {
  for (let code = 65; code <= 90; code += 1) {
    const suffix = String.fromCharCode(code)
    if (!used.has(suffix)) return suffix
  }
  return null
}

export async function POST(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  const auth = await requireAdmin(req.headers.get('authorization'), eventId)
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: sourceEvent, error: sourceEventError } = await adminClient
    .from('events')
    .select('id, name, location, event_date, status, is_public')
    .eq('id', eventId)
    .maybeSingle()

  if (sourceEventError) return NextResponse.json({ error: sourceEventError.message }, { status: 400 })
  if (!sourceEvent) return NextResponse.json({ error: 'Event not found' }, { status: 404 })

  const newEventId = randomUUID()
  const newEventName = `${sourceEvent.name} Copy`

  try {
    const { error: insertEventError } = await adminClient.from('events').insert([
      {
        id: newEventId,
        name: newEventName,
        location: sourceEvent.location,
        event_date: sourceEvent.event_date,
        status: sourceEvent.status,
        is_public: sourceEvent.is_public,
      },
    ])

    if (insertEventError) {
      return NextResponse.json({ error: insertEventError.message }, { status: 400 })
    }

    const { data: categoryRows, error: categoryError } = await adminClient
      .from('categories')
      .select('id, year, year_min, year_max, capacity, gender, label, enabled, sequence_order')
      .eq('event_id', eventId)
      .order('sequence_order', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true })
    if (categoryError) throw new Error(categoryError.message)

    const categoryIdMap = new Map<string, string>()
    const categoryInserts = buildInsertRows(categoryRows, (row) => {
      const newId = randomUUID()
      categoryIdMap.set(row.id, newId)
      return {
        id: newId,
        event_id: newEventId,
        year: row.year,
        year_min: row.year_min,
        year_max: row.year_max,
        capacity: row.capacity,
        gender: row.gender,
        label: row.label,
        enabled: row.enabled,
        sequence_order: row.sequence_order,
      }
    })
    if (categoryInserts.length > 0) {
      const { error } = await adminClient.from('categories').insert(categoryInserts)
      if (error) throw new Error(error.message)
    }

    const { data: riderRows, error: riderError } = await adminClient
      .from('riders')
      .select('id, name, rider_nickname, jersey_size, date_of_birth, primary_category_id, gender, plate_number, plate_suffix, club, photo_url, photo_thumbnail_url')
      .eq('event_id', eventId)
      .order('created_at', { ascending: true })
    if (riderError) throw new Error(riderError.message)

    const riderIdMap = new Map<string, string>()
    const usedPlatesByNumber = new Map<string, Set<string>>()
    const riderInserts = buildInsertRows(riderRows, (row) => {
      const newId = randomUUID()
      riderIdMap.set(row.id, newId)
      const plateNumber = normalizePlateNumber(row.plate_number)
      const requestedSuffix = normalizePlateSuffix(row.plate_suffix)
      let plateSuffix = requestedSuffix

      if (plateNumber) {
        const used = usedPlatesByNumber.get(plateNumber) ?? new Set<string>()
        const suffixKey = plateSuffix ?? '__NO_SUFFIX__'
        if (used.has(suffixKey)) {
          const replacement = nextAvailablePlateSuffix(used)
          if (!replacement) {
            throw new Error(`No available plate suffix left for duplicated plate ${plateNumber}`)
          }
          plateSuffix = replacement
        }
        used.add((plateSuffix ?? '__NO_SUFFIX__'))
        usedPlatesByNumber.set(plateNumber, used)
      }

      return {
        id: newId,
        event_id: newEventId,
        name: row.name,
        rider_nickname: row.rider_nickname,
        jersey_size: row.jersey_size,
        date_of_birth: row.date_of_birth,
        primary_category_id:
          typeof row.primary_category_id === 'string' ? (categoryIdMap.get(row.primary_category_id) ?? null) : null,
        gender: row.gender,
        plate_number: plateNumber,
        plate_suffix: plateSuffix,
        club: row.club,
        photo_url: row.photo_url,
        photo_thumbnail_url: row.photo_thumbnail_url,
      }
    })
    if (riderInserts.length > 0) {
      const { error } = await adminClient.from('riders').insert(riderInserts)
      if (error) throw new Error(error.message)
    }

    const { data: motoRows, error: motoError } = await adminClient
      .from('motos')
      .select('id, category_id, moto_name, moto_order, status, is_published, published_at, provisional_at')
      .eq('event_id', eventId)
      .order('moto_order', { ascending: true })
    if (motoError) throw new Error(motoError.message)

    const motoIdMap = new Map<string, string>()
    const motoInserts = buildInsertRows(motoRows, (row) => {
      const mappedCategoryId = categoryIdMap.get(row.category_id)
      if (!mappedCategoryId) return null
      const newId = randomUUID()
      motoIdMap.set(row.id, newId)
      return {
        id: newId,
        event_id: newEventId,
        category_id: mappedCategoryId,
        moto_name: row.moto_name,
        moto_order: row.moto_order,
        status: row.status,
        is_published: row.is_published,
        published_at: row.published_at,
        provisional_at: row.provisional_at,
      }
    })
    if (motoInserts.length > 0) {
      const { error } = await adminClient.from('motos').insert(motoInserts)
      if (error) throw new Error(error.message)
    }

    const copySimpleEventTable = async (table: string, select: string, mapRow: (row: Record<string, unknown>) => Record<string, unknown> | null) => {
      const { data, error } = await adminClient.from(table).select(select).eq('event_id', eventId)
      if (error) throw new Error(error.message)
      const inserts = buildInsertRows(toRecordArray(data), mapRow)
      if (inserts.length === 0) return
      const { error: insertError } = await adminClient.from(table).insert(inserts)
      if (insertError) throw new Error(insertError.message)
    }

    const copySimplePrimaryEventTable = async (table: string, select: string, mapRow: (row: Record<string, unknown>) => Record<string, unknown>) => {
      const { data, error } = await adminClient.from(table).select(select).eq('event_id', eventId).maybeSingle()
      if (error) throw new Error(error.message)
      const row = toRecord(data)
      if (!row) return
      const { error: insertError } = await adminClient.from(table).insert([mapRow(row)])
      if (insertError) throw new Error(insertError.message)
    }

    await copySimplePrimaryEventTable(
      'event_settings',
      'event_logo_url, sponsor_logo_urls, base_price, extra_price, registration_open, require_jersey_size, scoring_rules, display_theme, race_format_settings, business_settings',
      (row) => ({
        event_id: newEventId,
        event_logo_url: row.event_logo_url,
        sponsor_logo_urls: row.sponsor_logo_urls,
        base_price: row.base_price,
        extra_price: row.extra_price,
        registration_open: row.registration_open,
        require_jersey_size: row.require_jersey_size,
        scoring_rules: row.scoring_rules,
        display_theme: row.display_theme,
        race_format_settings: row.race_format_settings,
        business_settings: row.business_settings,
      })
    )

    await copySimplePrimaryEventTable(
      'event_feature_flags',
      'penalty_enabled, absent_enabled, dns_enabled, dnf_enabled',
      (row) => ({
        event_id: newEventId,
        penalty_enabled: row.penalty_enabled,
        absent_enabled: row.absent_enabled,
        dns_enabled: row.dns_enabled,
        dnf_enabled: row.dnf_enabled,
      })
    )

    await copySimplePrimaryEventTable(
      'event_absent_config',
      'absent_point',
      (row) => ({
        event_id: newEventId,
        absent_point: row.absent_point,
      })
    )

    await copySimplePrimaryEventTable(
      'event_approval_modes',
      'approval_mode',
      (row) => ({
        event_id: newEventId,
        approval_mode: row.approval_mode,
      })
    )

    await copySimpleEventTable(
      'race_stage_config',
      'id, category_id, enabled, max_riders_per_race, qualification_moto_count, repechage_max_riders_per_race, quarter_final_max_riders_per_race, semi_final_max_riders_per_race, dnf_point_override, dns_point_override',
      (row) => {
        const mappedCategoryId = categoryIdMap.get(String(row.category_id ?? ''))
        if (!mappedCategoryId) return null
        return {
          id: randomUUID(),
          event_id: newEventId,
          category_id: mappedCategoryId,
          enabled: row.enabled,
          max_riders_per_race: row.max_riders_per_race,
          qualification_moto_count: row.qualification_moto_count,
          repechage_max_riders_per_race: row.repechage_max_riders_per_race,
          quarter_final_max_riders_per_race: row.quarter_final_max_riders_per_race,
          semi_final_max_riders_per_race: row.semi_final_max_riders_per_race,
          dnf_point_override: row.dnf_point_override,
          dns_point_override: row.dns_point_override,
        }
      }
    )

    const copyCategoryTable = async (table: string, select: string, mapRow: (row: Record<string, unknown>, newId: string, mappedCategoryId: string) => Record<string, unknown>) => {
      const categoryIds = Array.from(categoryIdMap.keys())
      if (categoryIds.length === 0) return
      const { data, error } = await adminClient.from(table).select(select).in('category_id', categoryIds)
      if (error) throw new Error(error.message)
      const inserts = buildInsertRows(toRecordArray(data), (row) => {
        const mappedCategoryId = categoryIdMap.get(String(row.category_id ?? ''))
        if (!mappedCategoryId) return null
        return mapRow(row, randomUUID(), mappedCategoryId)
      })
      if (inserts.length === 0) return
      const { error: insertError } = await adminClient.from(table).insert(inserts)
      if (insertError) throw new Error(insertError.message)
    }

    await copyCategoryTable(
      'race_category_rule',
      'id, category_id, min_riders, enable_qualification, enable_quarter_final, enable_semi_final, enabled_final_classes',
      (row, newId, mappedCategoryId) => ({
        id: newId,
        category_id: mappedCategoryId,
        min_riders: row.min_riders,
        enable_qualification: row.enable_qualification,
        enable_quarter_final: row.enable_quarter_final,
        enable_semi_final: row.enable_semi_final,
        enabled_final_classes: row.enabled_final_classes,
      })
    )

    await copyCategoryTable(
      'race_category_custom_split_rule',
      'id, category_id, source_stage, rank_from, rank_to, target_stage, target_final_class, sort_order, split_basis, batch_no',
      (row, newId, mappedCategoryId) => ({
        id: newId,
        category_id: mappedCategoryId,
        source_stage: row.source_stage,
        rank_from: row.rank_from,
        rank_to: row.rank_to,
        target_stage: row.target_stage,
        target_final_class: row.target_final_class,
        sort_order: row.sort_order,
        split_basis: row.split_basis,
        batch_no: row.batch_no,
      })
    )

    const { data: eventPenaltyRuleRows, error: eventPenaltyRuleError } = await adminClient
      .from('event_penalty_rules')
      .select('id, code, description, penalty_point, applies_to_stage, is_active, checker_enabled, rd_enabled')
      .eq('event_id', eventId)
      .order('created_at', { ascending: true })
    if (eventPenaltyRuleError) throw new Error(eventPenaltyRuleError.message)
    const eventPenaltyRuleInserts = buildInsertRows(eventPenaltyRuleRows, (row) => ({
      id: randomUUID(),
      event_id: newEventId,
      code: row.code,
      description: row.description,
      penalty_point: row.penalty_point,
      applies_to_stage: row.applies_to_stage,
      is_active: row.is_active,
      checker_enabled: row.checker_enabled ?? true,
      rd_enabled: row.rd_enabled ?? true,
    }))
    if (eventPenaltyRuleInserts.length > 0) {
      const { error } = await adminClient.from('event_penalty_rules').insert(eventPenaltyRuleInserts)
      if (error) throw new Error(error.message)
    }

    const { data: safetyRequirementRows, error: safetyRequirementError } = await adminClient
      .from('event_safety_requirements')
      .select('id, label, is_required, sort_order, penalty_code, icon_key')
      .eq('event_id', eventId)
      .order('sort_order', { ascending: true })
    if (safetyRequirementError) throw new Error(safetyRequirementError.message)
    const safetyRequirementIdMap = new Map<string, string>()
    const safetyRequirementInserts = buildInsertRows(safetyRequirementRows, (row) => {
      const newId = randomUUID()
      safetyRequirementIdMap.set(row.id, newId)
      return {
        id: newId,
        event_id: newEventId,
        label: row.label,
        is_required: row.is_required,
        sort_order: row.sort_order,
        penalty_code: row.penalty_code,
        icon_key: row.icon_key ?? null,
      }
    })
    if (safetyRequirementInserts.length > 0) {
      const { error } = await adminClient.from('event_safety_requirements').insert(safetyRequirementInserts)
      if (error) throw new Error(error.message)
    }

    const { data: raceScheduleRows, error: raceScheduleError } = await adminClient
      .from('race_schedules')
      .select('id, moto_id, schedule_time, end_time, track_number')
      .eq('event_id', eventId)
      .order('schedule_time', { ascending: true })
    if (raceScheduleError) throw new Error(raceScheduleError.message)
    const raceScheduleInserts = buildInsertRows(raceScheduleRows, (row) => {
      const mappedMotoId = motoIdMap.get(String(row.moto_id ?? ''))
      if (!mappedMotoId) return null
      return {
        id: randomUUID(),
        event_id: newEventId,
        moto_id: mappedMotoId,
        schedule_time: row.schedule_time,
        end_time: row.end_time,
        track_number: row.track_number,
      }
    })
    if (raceScheduleInserts.length > 0) {
      const { error } = await adminClient.from('race_schedules').insert(raceScheduleInserts)
      if (error) throw new Error(error.message)
    }

    const { data: registrationRows, error: registrationError } = await adminClient
      .from('registrations')
      .select('id, community_name, contact_name, contact_phone, contact_email, total_amount, status, notes')
      .eq('event_id', eventId)
      .order('created_at', { ascending: true })
    if (registrationError) throw new Error(registrationError.message)
    const registrationIdMap = new Map<string, string>()
    const registrationInserts = buildInsertRows(registrationRows, (row) => {
      const newId = randomUUID()
      registrationIdMap.set(row.id, newId)
      return {
        id: newId,
        event_id: newEventId,
        community_name: row.community_name,
        contact_name: row.contact_name,
        contact_phone: row.contact_phone,
        contact_email: row.contact_email,
        total_amount: row.total_amount,
        status: row.status,
        notes: row.notes,
        upload_token: null,
        upload_token_created_at: null,
      }
    })
    if (registrationInserts.length > 0) {
      const { error } = await adminClient.from('registrations').insert(registrationInserts)
      if (error) throw new Error(error.message)
    }

    const { data: registrationItemRows, error: registrationItemError } = await adminClient
      .from('registration_items')
      .select('id, registration_id, rider_name, rider_nickname, jersey_size, date_of_birth, gender, club, primary_category_id, extra_category_id, requested_plate_number, requested_plate_suffix, photo_url, price, status')
      .in('registration_id', Array.from(registrationIdMap.keys()))
      .order('created_at', { ascending: true })
    if (registrationItemError) throw new Error(registrationItemError.message)
    const registrationItemIdMap = new Map<string, string>()
    const registrationItemInserts = buildInsertRows(registrationItemRows, (row) => {
      const mappedRegistrationId = registrationIdMap.get(String(row.registration_id ?? ''))
      if (!mappedRegistrationId) return null
      const newId = randomUUID()
      registrationItemIdMap.set(row.id, newId)
      return {
        id: newId,
        registration_id: mappedRegistrationId,
        rider_name: row.rider_name,
        rider_nickname: row.rider_nickname,
        jersey_size: row.jersey_size,
        date_of_birth: row.date_of_birth,
        gender: row.gender,
        club: row.club,
        primary_category_id:
          typeof row.primary_category_id === 'string' ? (categoryIdMap.get(row.primary_category_id) ?? null) : null,
        extra_category_id:
          typeof row.extra_category_id === 'string' ? (categoryIdMap.get(row.extra_category_id) ?? null) : null,
        requested_plate_number: row.requested_plate_number,
        requested_plate_suffix: row.requested_plate_suffix,
        photo_url: row.photo_url,
        price: row.price,
        status: row.status,
      }
    })
    if (registrationItemInserts.length > 0) {
      const { error } = await adminClient.from('registration_items').insert(registrationItemInserts)
      if (error) throw new Error(error.message)
    }

    const { data: registrationDocumentRows, error: registrationDocumentError } = await adminClient
      .from('registration_documents')
      .select('id, registration_id, registration_item_id, document_type, file_url')
      .in('registration_id', Array.from(registrationIdMap.keys()))
    if (registrationDocumentError) throw new Error(registrationDocumentError.message)
    const registrationDocumentInserts = buildInsertRows(registrationDocumentRows, (row) => {
      const mappedRegistrationId = registrationIdMap.get(String(row.registration_id ?? ''))
      if (!mappedRegistrationId) return null
      return {
        id: randomUUID(),
        registration_id: mappedRegistrationId,
        registration_item_id:
          typeof row.registration_item_id === 'string' ? (registrationItemIdMap.get(row.registration_item_id) ?? null) : null,
        document_type: row.document_type,
        file_url: row.file_url,
      }
    })
    if (registrationDocumentInserts.length > 0) {
      const { error } = await adminClient.from('registration_documents').insert(registrationDocumentInserts)
      if (error) throw new Error(error.message)
    }

    const { data: registrationPaymentRows, error: registrationPaymentError } = await adminClient
      .from('registration_payments')
      .select('id, registration_id, amount, bank_name, account_name, account_number, proof_url, status, payment_method')
      .in('registration_id', Array.from(registrationIdMap.keys()))
    if (registrationPaymentError) throw new Error(registrationPaymentError.message)
    const registrationPaymentInserts = buildInsertRows(registrationPaymentRows, (row) => {
      const mappedRegistrationId = registrationIdMap.get(String(row.registration_id ?? ''))
      if (!mappedRegistrationId) return null
      return {
        id: randomUUID(),
        registration_id: mappedRegistrationId,
        amount: row.amount,
        bank_name: row.bank_name,
        account_name: row.account_name,
        account_number: row.account_number,
        proof_url: row.proof_url,
        status: row.status,
        payment_method: row.payment_method,
      }
    })
    if (registrationPaymentInserts.length > 0) {
      const { error } = await adminClient.from('registration_payments').insert(registrationPaymentInserts)
      if (error) throw new Error(error.message)
    }

    await copySimpleEventTable(
      'rider_extra_categories',
      'id, rider_id, category_id',
      (row) => {
        const mappedRiderId = riderIdMap.get(String(row.rider_id ?? ''))
        const mappedCategoryId = categoryIdMap.get(String(row.category_id ?? ''))
        if (!mappedRiderId || !mappedCategoryId) return null
        return {
          id: randomUUID(),
          event_id: newEventId,
          rider_id: mappedRiderId,
          category_id: mappedCategoryId,
        }
      }
    )

    const { data: motoRiderRows, error: motoRiderError } = await adminClient
      .from('moto_riders')
      .select('id, moto_id, rider_id')
      .in('moto_id', Array.from(motoIdMap.keys()))
    if (motoRiderError) throw new Error(motoRiderError.message)
    const motoRiderInserts = buildInsertRows(motoRiderRows, (row) => {
      const mappedMotoId = motoIdMap.get(String(row.moto_id ?? ''))
      const mappedRiderId = riderIdMap.get(String(row.rider_id ?? ''))
      if (!mappedMotoId || !mappedRiderId) return null
      return {
        id: randomUUID(),
        moto_id: mappedMotoId,
        rider_id: mappedRiderId,
      }
    })
    if (motoRiderInserts.length > 0) {
      const { error } = await adminClient.from('moto_riders').insert(motoRiderInserts)
      if (error) throw new Error(error.message)
    }

    const { data: resultRows, error: resultError } = await adminClient
      .from('results')
      .select('id, moto_id, rider_id, finish_order, result_status')
      .eq('event_id', eventId)
    if (resultError) throw new Error(resultError.message)
    const resultInserts = buildInsertRows(resultRows, (row) => {
      const mappedMotoId = motoIdMap.get(String(row.moto_id ?? ''))
      const mappedRiderId = riderIdMap.get(String(row.rider_id ?? ''))
      if (!mappedMotoId || !mappedRiderId) return null
      return {
        id: randomUUID(),
        event_id: newEventId,
        moto_id: mappedMotoId,
        rider_id: mappedRiderId,
        finish_order: row.finish_order,
        result_status: row.result_status,
      }
    })
    if (resultInserts.length > 0) {
      const { error } = await adminClient.from('results').insert(resultInserts)
      if (error) throw new Error(error.message)
    }

    const { data: gateRows, error: gateError } = await adminClient
      .from('moto_gate_positions')
      .select('id, moto_id, rider_id, gate_position')
      .in('moto_id', Array.from(motoIdMap.keys()))
    if (gateError) throw new Error(gateError.message)
    const gateInserts = buildInsertRows(gateRows, (row) => {
      const mappedMotoId = motoIdMap.get(String(row.moto_id ?? ''))
      const mappedRiderId = riderIdMap.get(String(row.rider_id ?? ''))
      if (!mappedMotoId || !mappedRiderId) return null
      return {
        id: randomUUID(),
        moto_id: mappedMotoId,
        rider_id: mappedRiderId,
        gate_position: row.gate_position,
      }
    })
    if (gateInserts.length > 0) {
      const { error } = await adminClient.from('moto_gate_positions').insert(gateInserts)
      if (error) throw new Error(error.message)
    }

    await normalizeEventMotoSequence(newEventId)

    await copySimpleEventTable(
      'rider_participation_status',
      'id, moto_id, rider_id, participation_status, registration_order',
      (row) => {
        const mappedRiderId = riderIdMap.get(String(row.rider_id ?? ''))
        if (!mappedRiderId) return null
        return {
          id: randomUUID(),
          event_id: newEventId,
          moto_id: typeof row.moto_id === 'string' ? (motoIdMap.get(row.moto_id) ?? null) : null,
          rider_id: mappedRiderId,
          participation_status: row.participation_status,
          registration_order: row.registration_order,
        }
      }
    )

    const { data: penaltyRows, error: penaltyError } = await adminClient
      .from('rider_penalties')
      .select('id, rider_id, moto_id, stage, rule_code, penalty_point, note')
      .eq('event_id', eventId)
    if (penaltyError) throw new Error(penaltyError.message)
    const penaltyIdMap = new Map<string, string>()
    const penaltyInserts = buildInsertRows(penaltyRows, (row) => {
      const mappedRiderId = riderIdMap.get(String(row.rider_id ?? ''))
      if (!mappedRiderId) return null
      const newId = randomUUID()
      penaltyIdMap.set(row.id, newId)
      return {
        id: newId,
        rider_id: mappedRiderId,
        event_id: newEventId,
        moto_id: typeof row.moto_id === 'string' ? (motoIdMap.get(row.moto_id) ?? null) : null,
        stage: row.stage,
        rule_code: row.rule_code,
        penalty_point: row.penalty_point,
        note: row.note,
      }
    })
    if (penaltyInserts.length > 0) {
      const { error } = await adminClient.from('rider_penalties').insert(penaltyInserts)
      if (error) throw new Error(error.message)
    }

    const { data: penaltyApprovalRows, error: penaltyApprovalError } = await adminClient
      .from('rider_penalty_approvals')
      .select('id, penalty_id, approval_status, approved_by, approved_at')
      .in('penalty_id', Array.from(penaltyIdMap.keys()))
    if (penaltyApprovalError) throw new Error(penaltyApprovalError.message)
    const penaltyApprovalInserts = buildInsertRows(penaltyApprovalRows, (row) => {
      const mappedPenaltyId = penaltyIdMap.get(String(row.penalty_id ?? ''))
      if (!mappedPenaltyId) return null
      return {
        id: randomUUID(),
        penalty_id: mappedPenaltyId,
        approval_status: row.approval_status,
        approved_by: row.approved_by,
        approved_at: row.approved_at,
      }
    })
    if (penaltyApprovalInserts.length > 0) {
      const { error } = await adminClient.from('rider_penalty_approvals').insert(penaltyApprovalInserts)
      if (error) throw new Error(error.message)
    }

    await copySimpleEventTable(
      'race_awards',
      'id, rider_id, category_id, stage, rank_type, award_type, position',
      (row) => {
        const mappedRiderId = riderIdMap.get(String(row.rider_id ?? ''))
        if (!mappedRiderId) return null
        return {
          id: randomUUID(),
          event_id: newEventId,
          rider_id: mappedRiderId,
          category_id: typeof row.category_id === 'string' ? (categoryIdMap.get(row.category_id) ?? null) : null,
          stage: row.stage,
          rank_type: row.rank_type,
          award_type: row.award_type,
          position: row.position,
        }
      }
    )

    await copySimpleEventTable(
      'rider_status_updates',
      'id, moto_id, rider_id, proposed_status, created_by, approval_status, approved_by, approved_at, note',
      (row) => {
        const mappedRiderId = riderIdMap.get(String(row.rider_id ?? ''))
        if (!mappedRiderId) return null
        return {
          id: randomUUID(),
          event_id: newEventId,
          moto_id: typeof row.moto_id === 'string' ? (motoIdMap.get(row.moto_id) ?? null) : null,
          rider_id: mappedRiderId,
          proposed_status: row.proposed_status,
          created_by: row.created_by,
          approval_status: row.approval_status,
          approved_by: row.approved_by,
          approved_at: row.approved_at,
          note: row.note,
        }
      }
    )

    const { data: motoLockRows, error: motoLockError } = await adminClient
      .from('moto_locks')
      .select('moto_id, is_locked, locked_by, locked_at, unlocked_by, unlocked_at, reason')
      .eq('event_id', eventId)
    if (motoLockError) throw new Error(motoLockError.message)
    const motoLockInserts = buildInsertRows(motoLockRows, (row) => {
      const mappedMotoId = motoIdMap.get(String(row.moto_id ?? ''))
      if (!mappedMotoId) return null
      return {
        moto_id: mappedMotoId,
        event_id: newEventId,
        is_locked: row.is_locked,
        locked_by: row.locked_by,
        locked_at: row.locked_at,
        unlocked_by: row.unlocked_by,
        unlocked_at: row.unlocked_at,
        reason: row.reason,
      }
    })
    if (motoLockInserts.length > 0) {
      const { error } = await adminClient.from('moto_locks').insert(motoLockInserts)
      if (error) throw new Error(error.message)
    }

    const { data: safetyCheckRows, error: safetyCheckError } = await adminClient
      .from('rider_safety_checks')
      .select('id, moto_id, rider_id, requirement_id, is_checked, updated_at, updated_by')
      .eq('event_id', eventId)
    if (safetyCheckError) throw new Error(safetyCheckError.message)
    const safetyCheckInserts = buildInsertRows(safetyCheckRows, (row) => {
      const mappedMotoId = motoIdMap.get(String(row.moto_id ?? ''))
      const mappedRiderId = riderIdMap.get(String(row.rider_id ?? ''))
      const mappedRequirementId = safetyRequirementIdMap.get(String(row.requirement_id ?? ''))
      if (!mappedMotoId || !mappedRiderId || !mappedRequirementId) return null
      return {
        id: randomUUID(),
        event_id: newEventId,
        moto_id: mappedMotoId,
        rider_id: mappedRiderId,
        requirement_id: mappedRequirementId,
        is_checked: row.is_checked,
        updated_at: row.updated_at,
        updated_by: row.updated_by,
      }
    })
    if (safetyCheckInserts.length > 0) {
      const { error } = await adminClient.from('rider_safety_checks').insert(safetyCheckInserts)
      if (error) throw new Error(error.message)
    }

    const { data: stageResultRows, error: stageResultError } = await adminClient
      .from('race_stage_result')
      .select('id, rider_id, category_id, stage, batch_id, final_class, position, points')
      .in('category_id', Array.from(categoryIdMap.keys()))
    if (stageResultError) throw new Error(stageResultError.message)
    const stageResultInserts = buildInsertRows(stageResultRows, (row) => {
      const mappedRiderId = riderIdMap.get(String(row.rider_id ?? ''))
      const mappedCategoryId = categoryIdMap.get(String(row.category_id ?? ''))
      if (!mappedRiderId || !mappedCategoryId) return null
      return {
        id: randomUUID(),
        rider_id: mappedRiderId,
        category_id: mappedCategoryId,
        stage: row.stage,
        batch_id: typeof row.batch_id === 'string' ? (motoIdMap.get(row.batch_id) ?? row.batch_id) : null,
        final_class: row.final_class,
        position: row.position,
        points: row.points,
      }
    })
    if (stageResultInserts.length > 0) {
      const { error } = await adminClient.from('race_stage_result').insert(stageResultInserts)
      if (error) throw new Error(error.message)
    }

    await copySimpleEventTable(
      'user_event_roles',
      'id, user_id, role, is_active, assigned_by, notes',
      (row) => ({
        id: randomUUID(),
        user_id: row.user_id,
        event_id: newEventId,
        role: row.role,
        is_active: row.is_active,
        assigned_by: row.assigned_by,
        notes: row.notes,
      })
    )

    await copySimpleEventTable(
      'protests',
      'id, moto_id, rider_id, reason, note, decision, created_by, resolved_by, resolved_at',
      (row) => ({
        id: randomUUID(),
        event_id: newEventId,
        moto_id: typeof row.moto_id === 'string' ? (motoIdMap.get(row.moto_id) ?? null) : null,
        rider_id: typeof row.rider_id === 'string' ? (riderIdMap.get(row.rider_id) ?? null) : null,
        reason: row.reason,
        note: row.note,
        decision: row.decision,
        created_by: row.created_by,
        resolved_by: row.resolved_by,
        resolved_at: row.resolved_at,
      })
    )

    return NextResponse.json({
      data: {
        id: newEventId,
        name: newEventName,
      },
    })
  } catch (err: unknown) {
    await adminClient.from('events').delete().eq('id', newEventId)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to duplicate event' },
      { status: 400 }
    )
  }
}
