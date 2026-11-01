'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import CheckerTopbar from '../../../components/CheckerTopbar'
import { compareMotoSequence } from '../../../lib/motoSequence'
import { useApiFetch } from '@/src/hooks/useApiFetch'
import { useEventRaceRealtime } from '@/src/hooks/useEventRaceRealtime'
import { usePageVisibility } from '@/src/lib/usePageVisibility'

type StatusUpdate = {
  id: string
  rider_id: string
  proposed_status: string
  created_by: string
  created_at: string
}

type PenaltyRow = {
  id: string
  rider_id: string
  moto_id?: string | null
  stage: string
  rule_code: string
  penalty_point: number
  note?: string | null
  created_at: string
}

type ApprovedMotoPenaltyRow = PenaltyRow & {
  moto_id: string
  event_id: string
  riders?: RiderItem | RiderItem[] | null
  rider_penalty_approvals?: Array<{
    approval_status: string
    approved_at?: string | null
    approved_by?: string | null
  }>
}

type MotoRow = {
  id: string
  moto_name: string
  moto_order: number
  status: string
  category_id?: string
}

type EventItem = {
  id: string
  name: string
  status: string
}

type CategoryItem = {
  id: string
  label: string
  year?: number
  enabled?: boolean
}

type RiderItem = {
  id: string
  name: string
  no_plate_display: string
}

type PenaltyRuleItem = {
  id: string
  code: string
  description?: string | null
  penalty_point: number
  applies_to_stage: 'ALL' | 'MOTO' | 'QUARTER' | 'REPECHAGE' | 'SEMI' | 'FINAL'
  is_active: boolean
}

type PenaltyFormState = {
  categoryId: string
  riderId: string
  ruleCode: string
  stage: 'ALL' | 'MOTO' | 'QUARTER' | 'REPECHAGE' | 'SEMI' | 'FINAL'
  motoId: string
  note: string
}

type DqFormState = {
  categoryId: string
  riderId: string
  motoId: string
  reason: string
}

type EventDqFormState = {
  riderId: string
  categoryId: string
  reason: string
  scope: 'ALL' | 'CATEGORY'
}

type RDQuickScreen = 'HOME' | 'PENALTY' | 'DQ' | 'CANCEL_PENALTY' | 'FULL'

const normalizeRole = (value: string | null | undefined) => String(value ?? '').trim().toUpperCase()
const getErrorMessage = (err: unknown) => (err instanceof Error ? err.message : 'Request failed')
const motoStatusLabel: Record<string, string> = {
  UPCOMING: 'Akan datang',
  READY: 'Siap',
  LIVE: 'Sedang berjalan',
  PROVISIONAL: 'Hasil sementara',
  PROTEST_REVIEW: 'Sedang ditinjau',
  LOCKED: 'Terkunci',
}
const gateStatusLabel: Record<string, string> = {
  READY: 'Siap',
  CHECKING: 'Sedang diperiksa',
  LIVE: 'Sedang berjalan',
  BLOCKED: 'Belum siap',
}
const penaltyStageLabel: Record<string, string> = {
  ALL: 'Semua tahap',
  MOTO: 'Moto',
  QUARTER: 'Perempat final',
  REPECHAGE: 'Repechage',
  SEMI: 'Semifinal',
  FINAL: 'Final',
}
const riderStatusLabel: Record<string, string> = {
  ACTIVE: 'Hadir',
  DNS: 'DNS (tidak start)',
  DNF: 'DNF (tidak finis)',
  ABSENT: 'Absen',
  DQ: 'Diskualifikasi',
}

const getPenaltyStageForMoto = (motoName: string): PenaltyFormState['stage'] => {
  const normalized = motoName.trim().toUpperCase()
  if (normalized.startsWith('QUARTER FINAL')) return 'QUARTER'
  if (normalized.startsWith('REPECHAGE')) return 'REPECHAGE'
  if (normalized.startsWith('SEMI FINAL')) return 'SEMI'
  if (normalized.startsWith('FINAL')) return 'FINAL'
  return 'MOTO'
}

export default function RaceDirectorApprovalPage() {
  const isPageVisible = usePageVisibility()
  const [quickScreen, setQuickScreen] = useState<RDQuickScreen>('HOME')
  const [eventId, setEventId] = useState('')
  const [events, setEvents] = useState<EventItem[]>([])
  const [categories, setCategories] = useState<CategoryItem[]>([])
  const [statusUpdates, setStatusUpdates] = useState<StatusUpdate[]>([])
  const [penalties, setPenalties] = useState<PenaltyRow[]>([])
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null)
  const [approvalMode, setApprovalMode] = useState<'AUTO' | 'DIRECTOR'>('AUTO')
  const [savedApprovalMode, setSavedApprovalMode] = useState<'AUTO' | 'DIRECTOR'>('AUTO')
  const [savingApprovalMode, setSavingApprovalMode] = useState(false)
  const [motos, setMotos] = useState<MotoRow[]>([])
  const [lockedMap, setLockedMap] = useState<Record<string, boolean>>({})
  const [role, setRole] = useState<string | null>(null)
  const [riderMap, setRiderMap] = useState<Record<string, RiderItem>>({})
  const [categoryRiders, setCategoryRiders] = useState<RiderItem[]>([])
  const [penaltyRules, setPenaltyRules] = useState<PenaltyRuleItem[]>([])
  const [gateStatus, setGateStatus] = useState<
    Array<{
      moto_id: string
      moto_name: string
      category_id?: string | null
      category_label?: string
      status: string
      total: number
      ready: number
      absent: number
      warnings?: number
    }>
  >([])
  const [gateCategoryId, setGateCategoryId] = useState<string>('ALL')
  const [openCategoryId, setOpenCategoryId] = useState<string | null>(null)
  const [showAuditLogs, setShowAuditLogs] = useState(false)
  const [actionNotice, setActionNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [decisionModal, setDecisionModal] = useState<{
    type: 'status' | 'penalty'
    id: string
    decision: 'APPROVE' | 'REJECT'
    reason: string
  } | null>(null)
  const [decisionSubmitting, setDecisionSubmitting] = useState(false)
  const [auditLogs, setAuditLogs] = useState<
    Array<{
      id: string
      action_type: string
      performed_by: string
      rider_id: string | null
      moto_id: string | null
      reason: string | null
      created_at: string
    }>
  >([])
  const isFetchingRef = useRef(false)
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [penaltyForm, setPenaltyForm] = useState<PenaltyFormState>({
    categoryId: '',
    riderId: '',
    ruleCode: '',
    stage: 'ALL',
    motoId: '',
    note: '',
  })
  const [addingPenalty, setAddingPenalty] = useState(false)
  const [dqForm, setDqForm] = useState<DqFormState>({
    categoryId: '',
    riderId: '',
    motoId: '',
    reason: '',
  })
  const [dqCategoryRiders, setDqCategoryRiders] = useState<RiderItem[]>([])
  const [settingDq, setSettingDq] = useState(false)

  const [eventDqForm, setEventDqForm] = useState<EventDqFormState>({
    riderId: '',
    categoryId: '',
    reason: '',
    scope: 'ALL',
  })
  const [settingEventDq, setSettingEventDq] = useState(false)
  const [cancellingEventDq, setCancellingEventDq] = useState(false)
  const [penaltyReviewCategoryId, setPenaltyReviewCategoryId] = useState('')
  const [penaltyReviewMotoId, setPenaltyReviewMotoId] = useState('')
  const [approvedMotoPenalties, setApprovedMotoPenalties] = useState<ApprovedMotoPenaltyRow[]>([])
  const [loadingApprovedPenalties, setLoadingApprovedPenalties] = useState(false)
  const [voidReasons, setVoidReasons] = useState<Record<string, string>>({})
  const [voidingPenaltyId, setVoidingPenaltyId] = useState<string | null>(null)
  const [quickCategoryId, setQuickCategoryId] = useState('')
  const [quickMotoId, setQuickMotoId] = useState('')
  const [quickRiders, setQuickRiders] = useState<RiderItem[]>([])
  const [loadingQuickRiders, setLoadingQuickRiders] = useState(false)
  const [quickRiderSearch, setQuickRiderSearch] = useState('')
  const [quickRiderId, setQuickRiderId] = useState('')
  const [quickRuleCode, setQuickRuleCode] = useState('')
  const [quickPenaltyNote, setQuickPenaltyNote] = useState('')
  const [quickDqReason, setQuickDqReason] = useState('')
  const [quickVoidReasons, setQuickVoidReasons] = useState<Record<string, string>>({})
  const [quickMotoPenalties, setQuickMotoPenalties] = useState<ApprovedMotoPenaltyRow[]>([])
  const [loadingQuickMotoPenalties, setLoadingQuickMotoPenalties] = useState(false)
  const quickMotoPenaltiesRequestRef = useRef(0)

  const apiFetch = useApiFetch()

  const showNotice = useCallback((type: 'success' | 'error', message: string) => {
    setActionNotice({ type, message })
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current)
    noticeTimerRef.current = setTimeout(() => {
      setActionNotice(null)
    }, 4200)
  }, [])

  useEffect(() => {
    return () => {
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current)
    }
  }, [])

  useEffect(() => {
    const loadEvents = async () => {
      try {
        const res = await apiFetch('/api/jury/events?status=LIVE,UPCOMING')
        const rows = (res.data ?? []) as EventItem[]
        setEvents(rows)
        if (!eventId && rows.length) {
          const live = rows.find((ev) => String(ev.status).toUpperCase() === 'LIVE')
          setEventId((live ?? rows[0]).id)
        }
      } catch (err: unknown) {
        showNotice('error', getErrorMessage(err))
      }
    }
    loadEvents()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const loadRole = async () => {
      try {
        const access = await apiFetch('/api/auth/backoffice-access')
        if (typeof access?.data?.role === 'string') setRole(normalizeRole(access.data.role))
      } catch {
        setRole(null)
      }
    }
    void loadRole()
  }, [apiFetch])

  const loadEventData = useCallback(
    async ({
      silent = false,
      includeHeavy = true,
      showRefreshing = false,
      notifyOnError = false,
    }: {
      silent?: boolean
      includeHeavy?: boolean
      showRefreshing?: boolean
      notifyOnError?: boolean
    } = {}) => {
      if (!eventId || isFetchingRef.current) return false
      isFetchingRef.current = true
      if (!silent) setLoading(true)
      if (showRefreshing) setRefreshing(true)
      try {
        const fetchAllRiders = async () => {
          const all: RiderItem[] = []
          let page = 1
          const pageSize = 200
          let total = 0
          do {
            const qs = new URLSearchParams({
              event_id: eventId,
              page: String(page),
              page_size: String(pageSize),
            })
            const res = await apiFetch(`/api/riders?${qs.toString()}`)
            const rows = (res.data ?? []) as RiderItem[]
            total = Number(res.total ?? 0)
            all.push(...rows)
            page++
          } while (all.length < total)
          const map: Record<string, RiderItem> = {}
          for (const r of all) map[r.id] = r
          return map
        }

        const [approvalRes, modeRes, motoRes, lockRes, catRes, gateRes, auditRes, riderRes] = await Promise.all([
          apiFetch(`/api/race-director/approvals?event_id=${eventId}`),
          apiFetch(`/api/race-director/mode?event_id=${eventId}`),
          apiFetch(`/api/motos?event_id=${eventId}`),
          apiFetch(`/api/jury/events/${eventId}/locks`),
          apiFetch(`/api/events/${eventId}/categories`),
          apiFetch(`/api/race-director/events/${eventId}/gate-status`),
          includeHeavy ? apiFetch(`/api/race-director/audit?event_id=${eventId}`) : Promise.resolve(null),
          includeHeavy ? fetchAllRiders() : Promise.resolve(null),
        ])

        setStatusUpdates(approvalRes.status_updates ?? [])
        setPenalties(approvalRes.penalties ?? [])
        const loadedApprovalMode = (modeRes.data?.approval_mode as 'AUTO' | 'DIRECTOR') ?? 'AUTO'
        setApprovalMode(loadedApprovalMode)
        setSavedApprovalMode(loadedApprovalMode)
        setMotos((motoRes.data ?? []) as MotoRow[])
        const lockList = (lockRes.data ?? []) as Array<{ moto_id: string }>
        const map: Record<string, boolean> = {}
        for (const row of lockList) map[row.moto_id] = true
        setLockedMap(map)
        setCategories((catRes.data ?? []) as CategoryItem[])
        setGateStatus(gateRes.data ?? [])
        if (includeHeavy) {
          setAuditLogs(
            (auditRes as {
              data?: Array<{
                id: string
                action_type: string
                performed_by: string
                rider_id: string | null
                moto_id: string | null
                reason: string | null
                created_at: string
              }>
            } | null)?.data ?? []
          )
          setRiderMap((riderRes as Record<string, RiderItem> | null) ?? {})
        }
        setLastSyncAt(new Date().toLocaleTimeString())
        return true
      } catch (err: unknown) {
        if (notifyOnError) showNotice('error', getErrorMessage(err))
        return false
      } finally {
        if (!silent) setLoading(false)
        if (showRefreshing) setRefreshing(false)
        isFetchingRef.current = false
      }
    },
    [apiFetch, eventId, showNotice]
  )

  const refreshFromRealtime = useCallback(() => {
    if (
      isFetchingRef.current ||
      decisionSubmitting ||
      addingPenalty ||
      settingDq ||
      Boolean(voidingPenaltyId)
    ) {
      return
    }
    void loadEventData({ silent: true, includeHeavy: false })
  }, [addingPenalty, decisionSubmitting, loadEventData, settingDq, voidingPenaltyId])

  useEventRaceRealtime({
    eventId,
    enabled: isPageVisible,
    onRaceStateChanged: refreshFromRealtime,
  })

  useEffect(() => {
    void loadEventData({ silent: false, includeHeavy: true, notifyOnError: true })
  }, [loadEventData])

  useEffect(() => {
    if (!eventId || !isPageVisible) return
    const lightTimer = setInterval(() => {
      void loadEventData({ silent: true, includeHeavy: false })
    }, 60000)
    const heavyTimer = setInterval(() => {
      void loadEventData({ silent: true, includeHeavy: true })
    }, 300000)
    return () => {
      clearInterval(lightTimer)
      clearInterval(heavyTimer)
    }
  }, [eventId, isPageVisible, loadEventData])

  const categoriesSorted = useMemo(() => {
    return categories
      .filter((c) => c.enabled !== false)
      .sort((a, b) => {
        const ay = typeof a.year === 'number' ? a.year : 0
        const by = typeof b.year === 'number' ? b.year : 0
        return by - ay
      })
  }, [categories])

  const enabledCategoryIds = useMemo(() => {
    return new Set(categories.filter((c) => c.enabled !== false).map((c) => c.id))
  }, [categories])

  useEffect(() => {
    if (gateCategoryId === 'ALL') return
    const exists = categories.some((c) => c.id === gateCategoryId && c.enabled !== false)
    if (!exists) setGateCategoryId('ALL')
  }, [categories, gateCategoryId])

  useEffect(() => {
    if (gateCategoryId !== 'ALL') return
    const firstEnabled = categoriesSorted[0]
    if (firstEnabled?.id) setGateCategoryId(firstEnabled.id)
  }, [gateCategoryId, categoriesSorted])

  useEffect(() => {
    const firstEnabled = categoriesSorted[0]?.id ?? ''
    setPenaltyForm((prev) => {
      if (prev.categoryId || !firstEnabled) return prev
      return { ...prev, categoryId: firstEnabled }
    })
    setDqForm((prev) => {
      if (prev.categoryId || !firstEnabled) return prev
      return { ...prev, categoryId: firstEnabled }
    })
    setPenaltyReviewCategoryId((prev) => prev || firstEnabled)
  }, [categoriesSorted])

  useEffect(() => {
    const loadPenaltyRules = async () => {
      if (!eventId) {
        setPenaltyRules([])
        return
      }
      try {
        const res = await apiFetch(`/api/race-director/events/${eventId}/penalties`)
        setPenaltyRules(((res.data ?? []) as PenaltyRuleItem[]).filter((rule) => rule.is_active !== false))
      } catch (err: unknown) {
        showNotice('error', getErrorMessage(err))
      }
    }
    void loadPenaltyRules()
  }, [apiFetch, eventId, showNotice])

  useEffect(() => {
    const loadCategoryRiders = async () => {
      if (!eventId || !penaltyForm.categoryId) {
        setCategoryRiders([])
        return
      }
      try {
        const qs = new URLSearchParams({
          event_id: eventId,
          category_id: penaltyForm.categoryId,
          page: '1',
          page_size: '200',
        })
        const res = await apiFetch(`/api/riders?${qs.toString()}`)
        setCategoryRiders((res.data ?? []) as RiderItem[])
      } catch (err: unknown) {
        showNotice('error', getErrorMessage(err))
      }
    }
    void loadCategoryRiders()
  }, [apiFetch, eventId, penaltyForm.categoryId, showNotice])

  useEffect(() => {
    const loadDqCategoryRiders = async () => {
      if (!eventId || !dqForm.categoryId) {
        setDqCategoryRiders([])
        return
      }
      try {
        const qs = new URLSearchParams({
          event_id: eventId,
          category_id: dqForm.categoryId,
          page: '1',
          page_size: '200',
        })
        const res = await apiFetch(`/api/riders?${qs.toString()}`)
        setDqCategoryRiders((res.data ?? []) as RiderItem[])
      } catch (err: unknown) {
        showNotice('error', getErrorMessage(err))
      }
    }
    void loadDqCategoryRiders()
  }, [apiFetch, dqForm.categoryId, eventId, showNotice])

  const filteredGateStatus = useMemo(() => {
    const enabledOnly = gateStatus.filter(
      (row) => typeof row.category_id === 'string' && enabledCategoryIds.has(row.category_id)
    )
    if (gateCategoryId === 'ALL') return enabledOnly
    return enabledOnly.filter((row) => row.category_id === gateCategoryId)
  }, [gateStatus, gateCategoryId, enabledCategoryIds])

  const motosByCategory = useMemo(() => {
    const grouped = new Map<string, MotoRow[]>()
    for (const m of motos) {
      const catId = m.category_id ?? 'unknown'
      const list = grouped.get(catId) ?? []
      list.push(m)
      grouped.set(catId, list)
    }
    for (const [key, list] of grouped.entries()) {
      list.sort(compareMotoSequence)
      grouped.set(key, list)
    }
    return grouped
  }, [motos])

  const sortedStatusUpdates = useMemo(() => {
    return [...statusUpdates].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  }, [statusUpdates])

  const sortedPenalties = useMemo(() => {
    return [...penalties].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  }, [penalties])

  const selectedPenaltyRule = useMemo(
    () => penaltyRules.find((rule) => rule.code === penaltyForm.ruleCode) ?? null,
    [penaltyForm.ruleCode, penaltyRules]
  )

  const penaltyFormMotos = useMemo(() => {
    if (!penaltyForm.categoryId) return []
    return (motosByCategory.get(penaltyForm.categoryId) ?? []).filter(
      (m) => !['LOCKED', 'FINISHED'].includes((m.status ?? '').toUpperCase())
    )
  }, [motosByCategory, penaltyForm.categoryId])

  const dqFormMotos = useMemo(() => {
    if (!dqForm.categoryId) return []
    return motosByCategory.get(dqForm.categoryId) ?? []
  }, [dqForm.categoryId, motosByCategory])

  const penaltyReviewMotos = useMemo(() => {
    if (!penaltyReviewCategoryId) return []
    return motosByCategory.get(penaltyReviewCategoryId) ?? []
  }, [motosByCategory, penaltyReviewCategoryId])

  const quickTargetMotos = useMemo(() => {
    if (!quickCategoryId) return []
    return (motosByCategory.get(quickCategoryId) ?? []).filter(
      (moto) => !['LOCKED', 'FINISHED', 'PROTEST_REVIEW'].includes((moto.status ?? '').toUpperCase())
    )
  }, [motosByCategory, quickCategoryId])
  const selectedQuickMoto = quickTargetMotos.find((moto) => moto.id === quickMotoId) ?? null
  const quickPenaltyStage = selectedQuickMoto ? getPenaltyStageForMoto(selectedQuickMoto.moto_name) : 'MOTO'
  const quickPenaltyRules = useMemo(
    () => penaltyRules.filter((rule) => rule.applies_to_stage === 'ALL' || rule.applies_to_stage === quickPenaltyStage),
    [penaltyRules, quickPenaltyStage]
  )
  const selectedQuickPenaltyRule = quickPenaltyRules.find((rule) => rule.code === quickRuleCode) ?? null
  const filteredQuickRiders = useMemo(() => {
    const query = quickRiderSearch.trim().toLocaleLowerCase()
    if (!query) return quickRiders
    return quickRiders.filter((rider) =>
      `${rider.name} ${rider.no_plate_display}`.toLocaleLowerCase().includes(query)
    )
  }, [quickRiderSearch, quickRiders])

  useEffect(() => {
    if (quickCategoryId && categoriesSorted.some((category) => category.id === quickCategoryId)) return
    setQuickCategoryId(categoriesSorted[0]?.id ?? '')
  }, [categoriesSorted, quickCategoryId])

  useEffect(() => {
    if (quickMotoId && quickTargetMotos.some((moto) => moto.id === quickMotoId)) return
    const preferredMoto = quickTargetMotos.find((moto) => moto.status.toUpperCase() === 'LIVE')
      ?? quickTargetMotos.find((moto) => moto.status.toUpperCase() === 'READY')
      ?? quickTargetMotos.find((moto) => moto.status.toUpperCase() === 'UPCOMING')
      ?? quickTargetMotos[0]
    setQuickMotoId(preferredMoto?.id ?? '')
  }, [quickMotoId, quickTargetMotos])

  useEffect(() => {
    setQuickRiderId('')
    setQuickRiderSearch('')
  }, [quickMotoId])

  useEffect(() => {
    if (!quickRuleCode || quickPenaltyRules.some((rule) => rule.code === quickRuleCode)) return
    setQuickRuleCode('')
  }, [quickPenaltyRules, quickRuleCode])

  useEffect(() => {
    if (!penaltyReviewCategoryId) {
      setPenaltyReviewMotoId('')
      return
    }
    setPenaltyReviewMotoId((prev) => {
      if (prev && penaltyReviewMotos.some((moto) => moto.id === prev)) return prev
      return penaltyReviewMotos[0]?.id ?? ''
    })
  }, [penaltyReviewCategoryId, penaltyReviewMotos])

  const loadApprovedMotoPenalties = useCallback(
    async (targetMotoId = penaltyReviewMotoId) => {
      if (!targetMotoId) {
        setApprovedMotoPenalties([])
        return
      }
      setLoadingApprovedPenalties(true)
      try {
        const res = await apiFetch(`/api/race-director/motos/${targetMotoId}/penalties`)
        setApprovedMotoPenalties((res.data ?? []) as ApprovedMotoPenaltyRow[])
      } catch (err: unknown) {
        setApprovedMotoPenalties([])
        showNotice('error', getErrorMessage(err))
      } finally {
        setLoadingApprovedPenalties(false)
      }
    },
    [apiFetch, penaltyReviewMotoId, showNotice]
  )

  const loadQuickMotoPenalties = useCallback(async (targetMotoId: string) => {
    const requestId = quickMotoPenaltiesRequestRef.current + 1
    quickMotoPenaltiesRequestRef.current = requestId
    if (!targetMotoId) {
      setQuickMotoPenalties([])
      setLoadingQuickMotoPenalties(false)
      return
    }
    setQuickMotoPenalties([])
    setLoadingQuickMotoPenalties(true)
    try {
      const res = await apiFetch(`/api/race-director/motos/${targetMotoId}/penalties`)
      if (quickMotoPenaltiesRequestRef.current === requestId) {
        setQuickMotoPenalties((res.data ?? []) as ApprovedMotoPenaltyRow[])
      }
    } catch (err: unknown) {
      if (quickMotoPenaltiesRequestRef.current === requestId) {
        setQuickMotoPenalties([])
        showNotice('error', getErrorMessage(err))
      }
    } finally {
      if (quickMotoPenaltiesRequestRef.current === requestId) setLoadingQuickMotoPenalties(false)
    }
  }, [apiFetch, showNotice])

  useEffect(() => {
    if (quickScreen !== 'PENALTY' && quickScreen !== 'CANCEL_PENALTY') return
    void loadQuickMotoPenalties(quickMotoId)
  }, [loadQuickMotoPenalties, quickMotoId, quickScreen])

  useEffect(() => {
    if ((quickScreen !== 'PENALTY' && quickScreen !== 'DQ') || !quickMotoId) {
      setQuickRiders([])
      setLoadingQuickRiders(false)
      return
    }

    let cancelled = false
    const loadAssignedRiders = async () => {
      setLoadingQuickRiders(true)
      try {
        const res = await apiFetch(`/api/race-director/motos/${quickMotoId}/riders`)
        if (!cancelled) setQuickRiders((res.data ?? []) as RiderItem[])
      } catch (err: unknown) {
        if (!cancelled) {
          setQuickRiders([])
          showNotice('error', getErrorMessage(err))
        }
      } finally {
        if (!cancelled) setLoadingQuickRiders(false)
      }
    }

    void loadAssignedRiders()
    return () => {
      cancelled = true
    }
  }, [apiFetch, quickMotoId, quickScreen, showNotice])

  useEffect(() => {
    void loadApprovedMotoPenalties()
  }, [loadApprovedMotoPenalties])

  const timeAgo = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime()
    const sec = Math.max(0, Math.floor(diff / 1000))
    const min = Math.floor(sec / 60)
    const hr = Math.floor(min / 60)
    if (hr > 0) return `${hr}h ${min % 60}m ago`
    if (min > 0) return `${min}m ago`
    return `${sec}s ago`
  }

  const openDecisionModal = (type: 'status' | 'penalty', id: string, decision: 'APPROVE' | 'REJECT') => {
    if (approvalMode === 'AUTO') return
    setDecisionModal({ type, id, decision, reason: '' })
  }

  const handleSubmitDecision = async () => {
    if (!decisionModal || decisionSubmitting) return
    setDecisionSubmitting(true)
    const payloadReason = decisionModal.reason.trim()
    try {
      if (decisionModal.type === 'status') {
        await apiFetch('/api/race-director/approvals/status', {
          method: 'POST',
          body: JSON.stringify({
            update_id: decisionModal.id,
            decision: decisionModal.decision,
            reason: payloadReason || null,
          }),
        })
      } else {
        await apiFetch('/api/race-director/approvals/penalty', {
          method: 'POST',
          body: JSON.stringify({
            penalty_id: decisionModal.id,
            decision: decisionModal.decision,
            reason: payloadReason || null,
          }),
        })
      }
      const refreshed = await loadEventData({ silent: true, includeHeavy: false })
      setDecisionModal(null)
      if (refreshed) {
        showNotice(
          'success',
          `${decisionModal.type === 'status' ? 'Perubahan status' : 'Penalti'} ${decisionModal.decision === 'APPROVE' ? 'disetujui' : 'ditolak'
          }.`
        )
      } else {
        showNotice('error', 'Keputusan tersimpan, tapi refresh data gagal.')
      }
    } catch (err: unknown) {
      showNotice('error', getErrorMessage(err))
    } finally {
      setDecisionSubmitting(false)
    }
  }

  const handleSaveMode = async () => {
    if (!eventId || savingApprovalMode) return
    setSavingApprovalMode(true)
    try {
      await apiFetch('/api/race-director/mode', {
        method: 'PATCH',
        body: JSON.stringify({ event_id: eventId, approval_mode: approvalMode }),
      })
      setSavedApprovalMode(approvalMode)
      const refreshed = await loadEventData({ silent: true, includeHeavy: false })
      showNotice(refreshed ? 'success' : 'error', refreshed ? 'Cara persetujuan disimpan.' : 'Cara persetujuan tersimpan, tetapi data gagal diperbarui.')
    } catch (err: unknown) {
      showNotice('error', getErrorMessage(err))
    } finally {
      setSavingApprovalMode(false)
    }
  }

  const handleLock = async (motoId: string, lock: boolean) => {
    if (lock) {
      const ok = confirm(
        'Kunci hasil moto ini?\n\nSetelah dikunci, hasil tidak dapat diedit melalui alur biasa. Pastikan status rider dan penalti sudah diperiksa.'
      )
      if (!ok) return
    }
    try {
      const targetStatus = lock ? 'LOCKED' : 'PROVISIONAL'
      await apiFetch(`/api/motos/${motoId}/status`, {
        method: 'POST',
        body: JSON.stringify({ status: targetStatus }),
      })
      const refreshed = await loadEventData({ silent: true, includeHeavy: false })
      showNotice(
        refreshed ? 'success' : 'error',
        refreshed ? (lock ? 'Moto dikunci.' : 'Moto dibuka kembali.') : 'Status moto tersimpan, refresh gagal.'
      )
    } catch (err: unknown) {
      showNotice('error', getErrorMessage(err))
    }
  }

  const handleManualRefresh = async () => {
    const ok = await loadEventData({ silent: true, includeHeavy: true, showRefreshing: true, notifyOnError: true })
    if (ok) showNotice('success', 'Data diperbarui.')
  }

  const handlePenaltyFormChange = <K extends keyof PenaltyFormState>(key: K, value: PenaltyFormState[K]) => {
    setPenaltyForm((prev) => {
      const next = { ...prev, [key]: value }
      if (key === 'categoryId') {
        next.riderId = ''
        next.motoId = ''
      }
      if (key === 'ruleCode') {
        const rule = penaltyRules.find((item) => item.code === value)
        if (rule && rule.applies_to_stage !== 'ALL') {
          next.stage = rule.applies_to_stage
        }
      }
      if (key === 'stage' && value !== 'MOTO') {
        next.motoId = ''
      }
      return next
    })
  }

  const handleDqFormChange = <K extends keyof DqFormState>(key: K, value: DqFormState[K]) => {
    setDqForm((prev) => {
      const next = { ...prev, [key]: value }
      if (key === 'categoryId') {
        next.riderId = ''
        next.motoId = ''
      }
      return next
    })
  }

  const handleAddPenalty = async () => {
    if (!eventId) return
    if (!penaltyForm.categoryId || !penaltyForm.riderId || !penaltyForm.ruleCode) {
      showNotice('error', 'Kategori, rider, dan rule penalty wajib dipilih.')
      return
    }
    if (penaltyForm.stage === 'MOTO' && !penaltyForm.motoId) {
      showNotice('error', 'Pilih moto untuk penalty stage MOTO.')
      return
    }
    setAddingPenalty(true)
    try {
      await apiFetch(`/api/race-director/riders/${penaltyForm.riderId}/penalties`, {
        method: 'POST',
        body: JSON.stringify({
          event_id: eventId,
          rule_code: penaltyForm.ruleCode,
          stage: penaltyForm.stage,
          moto_id: penaltyForm.motoId || null,
          note: penaltyForm.note.trim() || null,
        }),
      })
      const refreshed = await loadEventData({ silent: true, includeHeavy: true })
      setPenaltyForm((prev) => ({
        ...prev,
        riderId: '',
        ruleCode: '',
        stage: 'ALL',
        motoId: '',
        note: '',
      }))
      showNotice(refreshed ? 'success' : 'error', refreshed ? 'Penalti berhasil ditambahkan.' : 'Penalti tersimpan, tetapi data gagal diperbarui.')
    } catch (err: unknown) {
      showNotice('error', getErrorMessage(err))
    } finally {
      setAddingPenalty(false)
    }
  }

  const openQuickScreen = (screen: RDQuickScreen) => {
    setQuickScreen(screen)
    setQuickRiderSearch('')
    setQuickRiderId('')
    if (screen !== 'PENALTY') {
      setQuickRuleCode('')
      setQuickPenaltyNote('')
    }
    if (screen !== 'DQ') setQuickDqReason('')
  }

  const handleQuickAddPenalty = async () => {
    if (!eventId || !quickMotoId || !quickRiderId || !selectedQuickPenaltyRule) {
      showNotice('error', 'Pilih rider dan aturan penalti terlebih dahulu.')
      return
    }

    setAddingPenalty(true)
    try {
      const stage = selectedQuickPenaltyRule.applies_to_stage === 'ALL'
        ? quickPenaltyStage
        : selectedQuickPenaltyRule.applies_to_stage
      await apiFetch(`/api/race-director/riders/${quickRiderId}/penalties`, {
        method: 'POST',
        body: JSON.stringify({
          event_id: eventId,
          rule_code: selectedQuickPenaltyRule.code,
          stage,
          moto_id: quickMotoId,
          note: quickPenaltyNote.trim() || null,
        }),
      })
      await Promise.all([
        loadQuickMotoPenalties(quickMotoId),
        loadEventData({ silent: true, includeHeavy: false }),
      ])
      setQuickRiderId('')
      setQuickRuleCode('')
      setQuickPenaltyNote('')
      showNotice('success', 'Penalti rider berhasil dicatat dan disetujui.')
    } catch (err: unknown) {
      showNotice('error', getErrorMessage(err))
    } finally {
      setAddingPenalty(false)
    }
  }

  const handleQuickSetDq = async () => {
    if (!quickMotoId || !quickRiderId || !quickDqReason.trim()) {
      showNotice('error', 'Pilih rider dan isi alasan DQ.')
      return
    }

    const selectedRider = quickRiders.find((rider) => rider.id === quickRiderId)
    const riderLabel = selectedRider ? `${selectedRider.no_plate_display} - ${selectedRider.name}` : 'rider terpilih'
    const motoLabel = selectedQuickMoto?.moto_name ?? 'moto terpilih'
    if (!window.confirm(`Terapkan DQ untuk ${riderLabel} pada ${motoLabel}?`)) return

    setSettingDq(true)
    try {
      await apiFetch(`/api/race-director/motos/${quickMotoId}/override`, {
        method: 'POST',
        body: JSON.stringify({
          results: [{ rider_id: quickRiderId, finish_order: null, result_status: 'DQ' }],
          reason: quickDqReason.trim(),
        }),
      })
      await loadEventData({ silent: true, includeHeavy: true })
      setQuickRiderId('')
      setQuickDqReason('')
      showNotice('success', 'DQ berhasil diterapkan pada moto ini.')
    } catch (err: unknown) {
      showNotice('error', getErrorMessage(err))
    } finally {
      setSettingDq(false)
    }
  }

  const handleSetDq = async () => {
    if (!dqForm.categoryId || !dqForm.riderId || !dqForm.motoId) {
      showNotice('error', 'Kategori, moto, dan rider wajib dipilih untuk set DQ.')
      return
    }
    setSettingDq(true)
    try {
      await apiFetch(`/api/race-director/motos/${dqForm.motoId}/override`, {
        method: 'POST',
        body: JSON.stringify({
          results: [
            {
              rider_id: dqForm.riderId,
              finish_order: null,
              result_status: 'DQ',
            },
          ],
          reason: dqForm.reason.trim() || 'Disqualification by Race Director',
        }),
      })
      const refreshed = await loadEventData({ silent: true, includeHeavy: true })
      setDqForm((prev) => ({
        ...prev,
        riderId: '',
        motoId: '',
        reason: '',
      }))
      showNotice(refreshed ? 'success' : 'error', refreshed ? 'Status DQ berhasil diterapkan.' : 'DQ tersimpan, refresh gagal.')
    } catch (err: unknown) {
      showNotice('error', getErrorMessage(err))
    } finally {
      setSettingDq(false)
    }
  }

  const handleQuickVoidPenalty = async (penalty: ApprovedMotoPenaltyRow) => {
    if (!quickMotoId) return
    const reason = (quickVoidReasons[penalty.id] ?? '').trim()
    if (!reason) {
      showNotice('error', 'Alasan pembatalan penalti wajib diisi.')
      return
    }
    const rider = quickRiders.find((item) => item.id === penalty.rider_id)
      ?? (Array.isArray(penalty.riders) ? penalty.riders[0] : penalty.riders)
    const riderLabel = rider ? `${rider.no_plate_display} - ${rider.name}` : 'rider terpilih'
    if (!window.confirm(`Batalkan penalti ${penalty.rule_code} untuk ${riderLabel}?`)) return

    setVoidingPenaltyId(penalty.id)
    try {
      await apiFetch(`/api/race-director/motos/${quickMotoId}/penalties`, {
        method: 'POST',
        body: JSON.stringify({ penalty_id: penalty.id, reason }),
      })
      setQuickVoidReasons((prev) => {
        const next = { ...prev }
        delete next[penalty.id]
        return next
      })
      await Promise.all([
        loadQuickMotoPenalties(quickMotoId),
        loadEventData({ silent: true, includeHeavy: false }),
      ])
      showNotice('success', `Penalti ${penalty.rule_code} untuk ${riderLabel} dibatalkan.`)
    } catch (err: unknown) {
      showNotice('error', getErrorMessage(err))
    } finally {
      setVoidingPenaltyId(null)
    }
  }

  const handleEventDqFormChange = <K extends keyof EventDqFormState>(key: K, value: EventDqFormState[K]) => {
    setEventDqForm((prev) => {
      const next = { ...prev, [key]: value }
      if (key === 'scope' && value === 'ALL') next.categoryId = ''
      return next
    })
  }

  const handleSetEventDq = async () => {
    if (!eventId || !eventDqForm.riderId) {
      showNotice('error', 'Event dan Rider wajib dipilih.')
      return
    }
    if (eventDqForm.scope === 'CATEGORY' && !eventDqForm.categoryId) {
      showNotice('error', 'Pilih kategori atau gunakan scope Semua Kategori.')
      return
    }
    if (!eventDqForm.reason.trim()) {
      showNotice('error', 'Alasan DQ event-wide wajib diisi.')
      return
    }
    const rider = riderMap[eventDqForm.riderId]
    const riderName = rider ? rider.name : 'Rider'
    const selectedCategoryLabel = categoriesSorted.find((category) => category.id === eventDqForm.categoryId)?.label
    const scopeLabel = eventDqForm.scope === 'CATEGORY'
      ? `kategori ${selectedCategoryLabel ?? 'terpilih'}`
      : 'seluruh kategori'
    const confirmMsg = `Anda akan mendiskualifikasi ${riderName} dari ${scopeLabel} di event ini. Semua hasil moto rider ini akan diubah menjadi diskualifikasi. Lanjutkan?`
    if (!window.confirm(confirmMsg)) return

    try {
      setSettingEventDq(true)
      const payload: Record<string, string> = { reason: eventDqForm.reason.trim() }
      if (eventDqForm.scope === 'CATEGORY' && eventDqForm.categoryId) {
        payload.categoryId = eventDqForm.categoryId
      }
      
      const res = await apiFetch(`/api/race-director/events/${eventId}/riders/${eventDqForm.riderId}/disqualify`, {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error(res.error || 'Gagal set DQ event-wide.')

      setEventDqForm({ riderId: '', categoryId: '', reason: '', scope: 'ALL' })
      const refreshed = await loadEventData()
      showNotice(
        refreshed ? 'success' : 'error',
        refreshed
          ? `Rider ${riderName} telah di-DQ pada ${scopeLabel}. ${res.motosAffected} moto terdampak.`
          : 'DQ tersimpan, refresh gagal.'
      )
    } catch (err: unknown) {
      showNotice('error', getErrorMessage(err))
    } finally {
      setSettingEventDq(false)
    }
  }

  const handleCancelEventDq = async () => {
    if (!eventId || !eventDqForm.riderId) {
      showNotice('error', 'Pilih rider yang DQ-nya akan dibatalkan.')
      return
    }
    if (eventDqForm.scope === 'CATEGORY' && !eventDqForm.categoryId) {
      showNotice('error', 'Pilih kategori atau gunakan scope Semua Kategori.')
      return
    }

    const riderName = riderMap[eventDqForm.riderId]?.name ?? 'rider ini'
    const selectedCategoryLabel = categoriesSorted.find((category) => category.id === eventDqForm.categoryId)?.label
    const scopeLabel = eventDqForm.scope === 'CATEGORY'
      ? `kategori ${selectedCategoryLabel ?? 'terpilih'}`
      : 'seluruh event'
    if (!window.confirm(`Batalkan DQ ${riderName} dari ${scopeLabel}? Hasil finish sebelum DQ harus dicek dan diinput ulang bila diperlukan.`)) {
      return
    }

    try {
      setCancellingEventDq(true)
      const query = eventDqForm.scope === 'CATEGORY' && eventDqForm.categoryId
        ? `?categoryId=${encodeURIComponent(eventDqForm.categoryId)}`
        : ''
      const res = await apiFetch(
        `/api/race-director/events/${eventId}/riders/${eventDqForm.riderId}/disqualify${query}`,
        { method: 'DELETE' }
      )
      const refreshed = await loadEventData({ silent: true, includeHeavy: true })
      showNotice(
        refreshed ? 'success' : 'error',
        refreshed
          ? `DQ ${riderName} dibatalkan pada ${res.motosAffected} moto. Periksa hasil finish rider.`
          : 'DQ dibatalkan, refresh gagal.'
      )
    } catch (err: unknown) {
      showNotice('error', getErrorMessage(err))
    } finally {
      setCancellingEventDq(false)
    }
  }



  const getApprovedPenaltyRider = (penalty: ApprovedMotoPenaltyRow) => {
    const rider = Array.isArray(penalty.riders) ? penalty.riders[0] : penalty.riders
    return rider ?? riderMap[penalty.rider_id] ?? null
  }

  const handleVoidPenalty = async (penaltyId: string) => {
    if (!penaltyReviewMotoId) return
    const reason = (voidReasons[penaltyId] ?? '').trim()
    if (!reason) {
      showNotice('error', 'Alasan void penalty wajib diisi.')
      return
    }
    setVoidingPenaltyId(penaltyId)
    try {
      await apiFetch(`/api/race-director/motos/${penaltyReviewMotoId}/penalties`, {
        method: 'POST',
        body: JSON.stringify({ penalty_id: penaltyId, reason }),
      })
      setVoidReasons((prev) => {
        const next = { ...prev }
        delete next[penaltyId]
        return next
      })
      await loadApprovedMotoPenalties(penaltyReviewMotoId)
      await loadEventData({ silent: true, includeHeavy: true })
      showNotice('success', 'Penalti dibatalkan. Riwayat tindakan sudah dicatat.')
    } catch (err: unknown) {
      showNotice('error', getErrorMessage(err))
    } finally {
      setVoidingPenaltyId(null)
    }
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-slate-100 text-slate-900">
      <CheckerTopbar title="Race Director Panel" />
      <main className="public-main max-w-[1500px]">
        <section className="public-hero">
          <div className="pointer-events-none absolute -bottom-20 -left-16 h-72 w-72 rounded-full bg-amber-400/15 blur-3xl" />
          <div className="pointer-events-none absolute -top-24 right-0 h-72 w-72 rounded-full bg-sky-400/15 blur-3xl" />
          <div className="relative z-10 grid gap-2">
            <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-amber-300">Race Director</p>
            <h1 className="text-3xl font-black tracking-tight text-white md:text-5xl">Panel Race Director</h1>
            <p className="max-w-2xl text-sm font-semibold text-slate-200 sm:text-base">
              Tinjau laporan, kelola diskualifikasi dan penalti, lalu kunci hasil moto setelah pemeriksaan selesai.
            </p>
          </div>
        </section>

        <section className="public-panel-light">
          <div className="grid gap-3">
            <label htmlFor="rd-event-select" className="grid gap-1 text-xs font-black uppercase tracking-wide text-slate-600">
              Event aktif
              <select
                id="rd-event-select"
                value={eventId}
                onChange={(e) => {
                  setEventId(e.target.value)
                  setCategories([])
                  setMotos([])
                  setPenaltyRules([])
                  setQuickCategoryId('')
                  setQuickMotoId('')
                  setQuickRiders([])
                  setQuickRiderId('')
                  setQuickRiderSearch('')
                  setQuickMotoPenalties([])
                  setLoadingQuickMotoPenalties(false)
                  quickMotoPenaltiesRequestRef.current += 1
                }}
                disabled={events.length === 0}
                className="public-filter disabled:opacity-60"
              >
                <option value="" disabled>
                  {events.length === 0 ? 'Tidak ada event aktif untuk dikelola' : 'Pilih event'}
                </option>
                {events.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.name} - {ev.status}
                  </option>
                ))}
              </select>
            </label>
            {quickScreen === 'FULL' && <div className="flex flex-wrap items-center gap-2">
              <label className="grid min-w-[240px] gap-1 text-xs font-black uppercase tracking-wide text-slate-600">
                Cara menyetujui laporan
                <select
                  value={approvalMode}
                  onChange={(e) => setApprovalMode(e.target.value as 'AUTO' | 'DIRECTOR')}
                  disabled={savingApprovalMode || !eventId}
                  className="public-filter"
                >
                  <option value="AUTO">Otomatis oleh sistem</option>
                  <option value="DIRECTOR">Perlu keputusan RD</option>
                </select>
              </label>
              <p className="max-w-lg text-xs font-semibold leading-5 text-slate-600">
                {approvalMode === 'AUTO'
                  ? 'Laporan status dan penalti diterapkan otomatis.'
                  : 'Laporan masuk ke antrean untuk disetujui atau ditolak di halaman ini.'}
                {approvalMode !== savedApprovalMode && ' Pilihan berubah; simpan untuk menerapkannya.'}
              </p>
              <button
                type="button"
                onClick={handleSaveMode}
                disabled={savingApprovalMode || !eventId || approvalMode === savedApprovalMode}
                className="inline-flex items-center justify-center rounded-xl border border-emerald-300 bg-emerald-100 px-4 py-2.5 text-sm font-extrabold text-emerald-800 transition-colors hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {savingApprovalMode ? 'Menyimpan...' : 'Simpan cara persetujuan'}
              </button>
              <button
                type="button"
                onClick={handleManualRefresh}
                disabled={loading || refreshing || !eventId}
                className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-extrabold uppercase tracking-[0.1em] text-slate-800 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {refreshing ? 'Memuat...' : 'Perbarui data'}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (eventId) window.location.assign(`/admin/events/${eventId}/results`)
                }}
                disabled={!eventId}
                className="inline-flex items-center justify-center rounded-xl border border-amber-400 bg-amber-300 px-4 py-2.5 text-sm font-extrabold uppercase tracking-[0.1em] text-amber-950 transition-colors hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Buka rekap hasil
              </button>
              <div
                className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-extrabold uppercase tracking-[0.12em] ${savedApprovalMode === 'AUTO'
                    ? 'border-emerald-300 bg-emerald-100 text-emerald-800'
                    : 'border-amber-300 bg-amber-100 text-amber-800'
                  }`}
              >
                {savedApprovalMode === 'AUTO' ? 'Persetujuan otomatis' : 'Persetujuan oleh RD'}
              </div>
              <div className="inline-flex items-center rounded-full border border-slate-300 bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
                Data diperbarui: {lastSyncAt ?? 'belum tersedia'}
              </div>
            </div>}
          </div>
        </section>

        {actionNotice && (
          <section
            role={actionNotice.type === 'error' ? 'alert' : 'status'}
            aria-live={actionNotice.type === 'error' ? 'assertive' : 'polite'}
            className={`fixed bottom-4 left-4 right-4 z-[70] mx-auto max-w-2xl rounded-xl border px-4 py-3 text-sm font-bold shadow-xl ${actionNotice.type === 'error'
                ? 'border-amber-300 bg-amber-100 text-amber-800'
                : 'border-emerald-300 bg-emerald-100 text-emerald-800'
              }`}
          >
            <div className="flex items-center justify-between gap-3">
              <span>{actionNotice.message}</span>
              <button
                type="button"
                onClick={() => setActionNotice(null)}
                className="rounded-full border border-current px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-[0.08em]"
              >
                Tutup
              </button>
            </div>
          </section>
        )}

        {quickScreen === 'HOME' && (
          <section className="public-panel-light grid gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Aksi Race Director</p>
              <h2 className="mt-1 text-xl font-black text-slate-900">Apa yang perlu dicatat?</h2>
              <p className="mt-1 text-sm font-semibold text-slate-600">Catat atau batalkan aksi pada rider. Moto yang sedang live otomatis dipilih lebih dulu.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <button
                type="button"
                onClick={() => openQuickScreen('PENALTY')}
                className="min-h-16 rounded-2xl border-2 border-amber-400 bg-amber-300 px-4 py-4 text-left text-base font-black text-amber-950 shadow-sm transition hover:bg-amber-200"
              >
                <span className="block text-2xl" aria-hidden="true">+</span>
                Beri penalti
              </button>
              <button
                type="button"
                onClick={() => openQuickScreen('DQ')}
                className="min-h-16 rounded-2xl border-2 border-rose-300 bg-rose-100 px-4 py-4 text-left text-base font-black text-rose-900 shadow-sm transition hover:bg-rose-200"
              >
                <span className="block text-2xl" aria-hidden="true">DQ</span>
                DQ satu moto
              </button>
              <button
                type="button"
                onClick={() => openQuickScreen('CANCEL_PENALTY')}
                className="min-h-16 rounded-2xl border-2 border-slate-300 bg-slate-100 px-4 py-4 text-left text-base font-black text-slate-800 shadow-sm transition hover:bg-slate-200"
              >
                <span className="block text-2xl" aria-hidden="true">-</span>
                Batalkan penalti
              </button>
              <button
                type="button"
                onClick={() => openQuickScreen('FULL')}
                className="min-h-16 rounded-2xl border-2 border-slate-300 bg-white px-4 py-4 text-left text-base font-black text-slate-800 shadow-sm transition hover:bg-slate-50"
              >
                <span className="block text-2xl" aria-hidden="true">...</span>
                Menu RD lainnya
              </button>
            </div>
          </section>
        )}

        {(quickScreen === 'PENALTY' || quickScreen === 'DQ' || quickScreen === 'CANCEL_PENALTY') && (
          <section className="public-panel-light grid gap-4">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => openQuickScreen('HOME')}
                className="min-h-11 rounded-xl border border-slate-300 bg-white px-4 text-sm font-extrabold text-slate-700 hover:bg-slate-50"
              >
                Kembali
              </button>
              <div>
                <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Aksi Race Director</p>
                <h2 className="text-xl font-black text-slate-900">
                  {quickScreen === 'PENALTY' ? 'Beri penalti' : quickScreen === 'DQ' ? 'DQ satu moto' : 'Batalkan penalti'}
                </h2>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-xs font-black uppercase tracking-wide text-slate-600">
                Kategori
                <select
                  value={quickCategoryId}
                  onChange={(e) => {
                    setQuickCategoryId(e.target.value)
                    setQuickMotoId('')
                    setQuickRiderId('')
                    setQuickRiderSearch('')
                    setQuickRuleCode('')
                  }}
                  disabled={!eventId || categoriesSorted.length === 0}
                  className="public-filter min-h-12 w-full"
                >
                  {categoriesSorted.length === 0 && <option value="">Belum ada kategori</option>}
                  {categoriesSorted.map((category) => <option key={category.id} value={category.id}>{category.label}</option>)}
                </select>
              </label>
              <label className="grid gap-1 text-xs font-black uppercase tracking-wide text-slate-600">
                Moto / batch
                <select
                  value={quickMotoId}
                  onChange={(e) => setQuickMotoId(e.target.value)}
                  disabled={!quickCategoryId || quickTargetMotos.length === 0}
                  className="public-filter min-h-12 w-full"
                >
                  {quickTargetMotos.length === 0 && <option value="">Belum ada moto yang bisa diedit</option>}
                  {quickTargetMotos.map((moto) => (
                    <option key={moto.id} value={moto.id}>
                      {moto.moto_name} - {motoStatusLabel[moto.status.toUpperCase()] ?? moto.status}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {selectedQuickMoto && (
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700">
                <span>{categoriesSorted.find((category) => category.id === quickCategoryId)?.label}</span>
                <span aria-hidden="true">-</span>
                <span>{selectedQuickMoto.moto_name}</span>
                <span className="rounded-full bg-white px-2.5 py-1 text-xs font-black uppercase">{motoStatusLabel[selectedQuickMoto.status.toUpperCase()] ?? selectedQuickMoto.status}</span>
              </div>
            )}

            {quickScreen !== 'CANCEL_PENALTY' && <div className="grid gap-2">
              <label htmlFor="rd-quick-rider-search" className="text-xs font-black uppercase tracking-wide text-slate-600">Cari rider di batch ini</label>
              <input
                id="rd-quick-rider-search"
                type="search"
                value={quickRiderSearch}
                onChange={(e) => setQuickRiderSearch(e.target.value)}
                disabled={!quickMotoId || loadingQuickRiders}
                placeholder="Ketik nama atau nomor plat"
                className="public-filter min-h-12 w-full"
              />
              <p className="text-xs font-semibold text-slate-500">Daftar hanya berisi rider yang terdaftar pada moto/batch terpilih.</p>
              <div className="grid max-h-64 gap-2 overflow-y-auto overscroll-contain rounded-xl border border-slate-200 bg-slate-50 p-2">
                {loadingQuickRiders ? (
                  <p className="p-3 text-sm font-bold text-slate-600">Memuat rider...</p>
                ) : !quickMotoId ? (
                  <p className="p-3 text-sm font-bold text-slate-600">Pilih kategori dan moto terlebih dahulu.</p>
                ) : filteredQuickRiders.length === 0 ? (
                  <p className="p-3 text-sm font-bold text-slate-600">Tidak ada rider yang cocok pada batch ini.</p>
                ) : filteredQuickRiders.map((rider) => {
                  const selected = quickRiderId === rider.id
                  return (
                    <button
                      key={rider.id}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setQuickRiderId(selected ? '' : rider.id)}
                      className={`flex min-h-14 w-full items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left transition ${selected ? 'border-amber-500 bg-amber-100 ring-2 ring-amber-300' : 'border-slate-200 bg-white hover:border-slate-400'}`}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-black text-slate-900">{rider.name}</span>
                        <span className="mt-0.5 block text-xs font-bold text-slate-500">#{rider.no_plate_display}</span>
                      </span>
                      <span className="shrink-0 text-xs font-black text-slate-600">{selected ? 'Dipilih' : 'Pilih'}</span>
                    </button>
                  )
                })}
              </div>
            </div>}

            {quickScreen === 'PENALTY' ? (
              <div className="grid gap-3 border-t border-slate-200 pt-4">
                <label className="grid gap-1 text-xs font-black uppercase tracking-wide text-slate-600">
                  Aturan penalti
                  <select
                    value={quickRuleCode}
                    onChange={(e) => setQuickRuleCode(e.target.value)}
                    disabled={!quickRiderId || quickPenaltyRules.length === 0}
                    className="public-filter min-h-12 w-full"
                  >
                    <option value="">Pilih penalti</option>
                    {quickPenaltyRules.map((rule) => (
                      <option key={rule.id} value={rule.code}>
                        {rule.code} - {rule.penalty_point} poin{rule.description ? ` - ${rule.description}` : ''}
                      </option>
                    ))}
                  </select>
                </label>
                {selectedQuickPenaltyRule && (
                  <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-950">
                    {selectedQuickPenaltyRule.description || selectedQuickPenaltyRule.code} - {selectedQuickPenaltyRule.penalty_point} poin
                  </p>
                )}
                {quickPenaltyRules.length === 0 && <p className="text-sm font-semibold text-slate-600">Belum ada aturan penalti aktif untuk stage moto ini.</p>}
                <label className="grid gap-1 text-xs font-black uppercase tracking-wide text-slate-600">
                  Catatan (opsional)
                  <textarea
                    value={quickPenaltyNote}
                    onChange={(e) => setQuickPenaltyNote(e.target.value)}
                    rows={2}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm font-semibold text-slate-800 outline-none focus:border-amber-500"
                    placeholder="Contoh: pelanggaran perlengkapan saat race"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => void handleQuickAddPenalty()}
                  disabled={addingPenalty || !quickRiderId || !selectedQuickPenaltyRule || !quickMotoId}
                  className="min-h-14 w-full rounded-xl border-2 border-amber-500 bg-amber-300 px-4 py-3 text-base font-black text-amber-950 shadow-sm hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {addingPenalty ? 'Menyimpan penalti...' : 'Simpan penalti'}
                </button>

                <div className="grid gap-2 border-t border-slate-200 pt-4">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-base font-black text-slate-900">Penalti pada moto ini</h3>
                    <button
                      type="button"
                      onClick={() => void loadQuickMotoPenalties(quickMotoId)}
                      disabled={!quickMotoId || loadingQuickMotoPenalties}
                      className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-xs font-extrabold text-slate-700 disabled:opacity-50"
                    >
                      {loadingQuickMotoPenalties ? 'Memuat...' : 'Muat ulang'}
                    </button>
                  </div>
                  {loadingQuickMotoPenalties ? (
                    <p className="rounded-xl border border-dashed border-slate-300 p-3 text-sm font-semibold text-slate-600">Memuat riwayat penalti...</p>
                  ) : quickMotoPenalties.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-slate-300 p-3 text-sm font-semibold text-slate-600">Belum ada penalti pada moto ini.</p>
                  ) : quickMotoPenalties.map((penalty) => {
                    const rider = getApprovedPenaltyRider(penalty)
                    return (
                      <article key={penalty.id} className="rounded-xl border border-slate-200 bg-white p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-black text-slate-900">{rider ? `${rider.no_plate_display} - ${rider.name}` : penalty.rider_id}</p>
                            <p className="mt-1 text-xs font-bold text-slate-600">{penalty.rule_code} - {penalty.penalty_point} poin - {timeAgo(penalty.created_at)}</p>
                            {penalty.note && <p className="mt-1 text-xs font-medium text-slate-500">Catatan: {penalty.note}</p>}
                          </div>
                          <span className="shrink-0 rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-black uppercase text-emerald-800">Disetujui</span>
                        </div>
                      </article>
                    )
                  })}
                </div>
              </div>
            ) : quickScreen === 'DQ' ? (
              <div className="grid gap-3 border-t border-slate-200 pt-4">
                <label className="grid gap-1 text-xs font-black uppercase tracking-wide text-slate-600">
                  Alasan DQ (wajib)
                  <textarea
                    value={quickDqReason}
                    onChange={(e) => setQuickDqReason(e.target.value)}
                    rows={3}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm font-semibold text-slate-800 outline-none focus:border-rose-500"
                    placeholder="Tulis alasan diskualifikasi"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => void handleQuickSetDq()}
                  disabled={settingDq || !quickRiderId || !quickDqReason.trim() || !quickMotoId}
                  className="min-h-14 w-full rounded-xl border-2 border-rose-400 bg-rose-100 px-4 py-3 text-base font-black text-rose-900 shadow-sm hover:bg-rose-200 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {settingDq ? 'Menyimpan DQ...' : 'Terapkan DQ pada moto ini'}
                </button>
              </div>
            ) : (
              <div className="grid gap-3 border-t border-slate-200 pt-4">
                <div>
                  <h3 className="text-base font-black text-slate-900">Pilih penalti yang akan dibatalkan</h3>
                  <p className="mt-1 text-sm font-semibold text-slate-600">Isi alasan pembatalan pada penalti yang benar. Pembatalan akan tersimpan di riwayat tindakan.</p>
                </div>
                {loadingQuickMotoPenalties ? (
                  <p className="rounded-xl border border-dashed border-slate-300 p-3 text-sm font-semibold text-slate-600">Memuat penalti moto ini...</p>
                ) : !quickMotoId ? (
                  <p className="rounded-xl border border-dashed border-slate-300 p-3 text-sm font-semibold text-slate-600">Pilih kategori dan moto terlebih dahulu.</p>
                ) : quickMotoPenalties.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-slate-300 p-3 text-sm font-semibold text-slate-600">Tidak ada penalti aktif pada moto ini.</p>
                ) : quickMotoPenalties.map((penalty) => {
                  const rider = getApprovedPenaltyRider(penalty)
                  const reason = quickVoidReasons[penalty.id] ?? ''
                  const isVoiding = voidingPenaltyId === penalty.id
                  return (
                    <article key={penalty.id} className="grid gap-3 rounded-xl border border-slate-200 bg-white p-3">
                      <div>
                        <p className="text-sm font-black text-slate-900">{rider ? `${rider.no_plate_display} - ${rider.name}` : penalty.rider_id}</p>
                        <p className="mt-1 text-xs font-bold text-slate-600">{penalty.rule_code} - {penalty.penalty_point} poin - {timeAgo(penalty.created_at)}</p>
                        {penalty.note && <p className="mt-1 text-xs font-medium text-slate-500">Catatan penalti: {penalty.note}</p>}
                      </div>
                      <label className="grid gap-1 text-xs font-black uppercase tracking-wide text-slate-600">
                        Alasan pembatalan (wajib)
                        <textarea
                          value={reason}
                          onChange={(e) => setQuickVoidReasons((prev) => ({ ...prev, [penalty.id]: e.target.value }))}
                          rows={2}
                          disabled={isVoiding}
                          className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm font-semibold text-slate-800 outline-none focus:border-slate-500"
                          placeholder="Contoh: penalti salah diberikan setelah pengecekan ulang"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => void handleQuickVoidPenalty(penalty)}
                        disabled={isVoiding || !reason.trim()}
                        className="min-h-12 w-full rounded-xl border-2 border-rose-300 bg-rose-100 px-4 py-3 text-sm font-black text-rose-900 hover:bg-rose-200 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isVoiding ? 'Membatalkan penalti...' : 'Batalkan penalti ini'}
                      </button>
                    </article>
                  )
                })}
              </div>
            )}
          </section>
        )}

        {quickScreen === 'FULL' && (
          <>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => openQuickScreen('HOME')}
            className="min-h-11 rounded-xl border border-slate-300 bg-white px-4 text-sm font-extrabold text-slate-700 hover:bg-slate-50"
          >
            Beranda RD
          </button>
        </div>
        <nav aria-label="Lompat ke bagian Race Director" className="sticky top-[108px] z-40 overflow-x-auto rounded-xl border border-slate-300 bg-white/95 p-2 shadow-sm backdrop-blur sm:top-[68px]">
          <div className="flex min-w-max gap-2">
            {[
              ['rd-summary', 'Ringkasan'],
              ['rd-status-updates', 'Perubahan status'],
              ['rd-penalty-approvals', 'Setujui penalti'],
              ['rd-moto-lock', 'Kunci hasil moto'],
              ['rd-dq-moto', 'Diskualifikasi satu moto'],
              ['rd-dq-event', 'Diskualifikasi event/kategori'],
              ['rd-penalty-review', 'Batalkan penalti'],
              ['rd-penalty-tools', 'Tambah penalti'],
              ['rd-audit', 'Riwayat tindakan'],
            ].map(([target, label]) => (
              <a
                key={target}
                href={`#${target}`}
                className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-extrabold text-slate-700 hover:border-slate-400 hover:bg-slate-100"
              >
                {label}
              </a>
            ))}
          </div>
        </nav>

        {loading && (
          <div className="public-panel-light">
            <div className="text-sm font-extrabold uppercase tracking-[0.12em] text-slate-600">Memuat...</div>
          </div>
        )}

        <div id="rd-summary" className="scroll-mt-36 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="public-panel-light">
            <div style={{ fontSize: 12, fontWeight: 800, color: '#333' }}>Perubahan status menunggu</div>
            <div style={{ fontSize: 22, fontWeight: 950 }}>{statusUpdates.length}</div>
          </div>
          <div className="public-panel-light">
            <div style={{ fontSize: 12, fontWeight: 800, color: '#333' }}>Penalti menunggu</div>
            <div style={{ fontSize: 22, fontWeight: 950 }}>{penalties.length}</div>
          </div>
          <div className="public-panel-light">
            <div style={{ fontSize: 12, fontWeight: 800, color: '#333' }}>Moto terkunci</div>
            <div style={{ fontSize: 22, fontWeight: 950 }}>
              {Object.values(lockedMap).filter(Boolean).length}
            </div>
          </div>
          <div className="public-panel-light">
            <div style={{ fontSize: 12, fontWeight: 800, color: '#333' }}>Kesiapan gate</div>
            <div style={{ marginTop: 8 }}>
              <select
                value={gateCategoryId}
                onChange={(e) => setGateCategoryId(e.target.value)}
                className="public-filter"
                style={{ width: '100%' }}
              >
                <option value="ALL">Semua Kategori</option>
                {categoriesSorted.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.label}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
              {filteredGateStatus.length === 0 && (
                <div style={{ fontSize: 12, color: '#333' }}>
                  {gateCategoryId === 'ALL' ? 'Belum ada data.' : 'Belum ada moto untuk kategori ini.'}
                </div>
              )}
              {filteredGateStatus.map((g) => (
                <div
                  className="rd-gate-row"
                  key={g.moto_id}
                  style={{
                    border: '2px solid #111',
                    borderRadius: 10,
                    padding: '6px 8px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 8,
                    background:
                      g.status === 'READY'
                        ? '#bfead2'
                        : g.status === 'CHECKING'
                          ? '#ffe9a8'
                          : '#fff',
                    fontSize: 12,
                    fontWeight: 900,
                  }}
                >
                  <span>{gateCategoryId === 'ALL' ? `${g.category_label ?? 'Category'} - ${g.moto_name}` : g.moto_name}</span>
                  <span className="rd-gate-meta">
                    {gateStatusLabel[g.status] ?? g.status}
                    {' · '}{g.ready}/{g.total} gate siap
                    {g.warnings && g.warnings > 0 ? ` · ${g.warnings} peringatan` : ''}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="grid gap-4">
          <section id="rd-dq-moto" className="public-panel-light scroll-mt-36">
            <div style={{ fontWeight: 900, fontSize: 18 }}>Diskualifikasi untuk satu moto</div>
            <div style={{ marginTop: 6, fontSize: 13, fontWeight: 700, color: '#475569' }}>
              Hanya mengubah hasil rider pada moto yang dipilih. Gunakan diskualifikasi event jika berlaku untuk seluruh hasil rider.
            </div>
            <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
              <div className="rd-form-grid" style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
                <div style={{ display: 'grid', gap: 6 }}>
                  <label htmlFor="rd-dq-category" style={{ fontSize: 12, fontWeight: 900, color: '#475569' }}>Kategori</label>
                  <select
                    id="rd-dq-category"
                    value={dqForm.categoryId}
                    onChange={(e) => handleDqFormChange('categoryId', e.target.value)}
                    className="public-filter"
                  >
                    <option value="">Pilih kategori</option>
                    {categoriesSorted.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div style={{ display: 'grid', gap: 6 }}>
                  <label htmlFor="rd-dq-moto-select" style={{ fontSize: 12, fontWeight: 900, color: '#475569' }}>Moto</label>
                  <select
                    id="rd-dq-moto-select"
                    value={dqForm.motoId}
                    onChange={(e) => handleDqFormChange('motoId', e.target.value)}
                    className="public-filter"
                  >
                    <option value="">Pilih moto</option>
                    {dqFormMotos.map((moto) => (
                      <option key={moto.id} value={moto.id}>
                        {moto.moto_order}. {moto.moto_name} - {motoStatusLabel[moto.status.toUpperCase()] ?? moto.status}
                      </option>
                    ))}
                  </select>
                </div>
                <div style={{ display: 'grid', gap: 6 }}>
                  <label htmlFor="rd-dq-rider" style={{ fontSize: 12, fontWeight: 900, color: '#475569' }}>Rider</label>
                  <select
                    id="rd-dq-rider"
                    value={dqForm.riderId}
                    onChange={(e) => handleDqFormChange('riderId', e.target.value)}
                    className="public-filter"
                  >
                    <option value="">Pilih rider</option>
                    {dqCategoryRiders.map((rider) => (
                      <option key={rider.id} value={rider.id}>
                        {rider.no_plate_display} - {rider.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div style={{ display: 'grid', gap: 6 }}>
                  <label htmlFor="rd-dq-reason" style={{ fontSize: 12, fontWeight: 900, color: '#475569' }}>Alasan (opsional)</label>
                  <input
                    id="rd-dq-reason"
                    value={dqForm.reason}
                    onChange={(e) => handleDqFormChange('reason', e.target.value)}
                    className="public-filter"
                    placeholder="Contoh: cutting track / kontak fisik berbahaya"
                  />
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={handleSetDq}
                  disabled={settingDq || !eventId}
                  className="inline-flex items-center justify-center rounded-xl border border-red-300 bg-red-100 px-4 py-2.5 text-sm font-extrabold uppercase tracking-[0.1em] text-red-800 transition-colors hover:bg-red-200 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {settingDq ? 'Menerapkan...' : 'Terapkan diskualifikasi'}
                </button>
              </div>
            </div>
          </section>

          <section id="rd-dq-event" className="public-panel-light scroll-mt-36">
            <div style={{ fontWeight: 900, fontSize: 18 }}>Diskualifikasi event atau kategori</div>
            <div style={{ marginTop: 6, fontSize: 13, fontWeight: 700, color: '#475569' }}>
              Mengubah hasil semua moto rider dalam cakupan yang dipilih. Alasan wajib diisi dan aplikasi akan meminta konfirmasi sebelum menerapkan.
            </div>
            <div style={{ marginTop: 12, display: 'grid', gap: 12 }}>
              <div className="rd-form-grid" style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
                <div style={{ display: 'grid', gap: 6 }}>
                  <label htmlFor="rd-event-dq-scope" style={{ fontSize: 12, fontWeight: 900, color: '#475569' }}>Terapkan pada</label>
                  <select
                    id="rd-event-dq-scope"
                    value={eventDqForm.scope}
                    onChange={(e) => handleEventDqFormChange('scope', e.target.value as 'ALL' | 'CATEGORY')}
                    className="public-filter"
                  >
                    <option value="ALL">Seluruh kategori di event</option>
                    <option value="CATEGORY">Satu kategori saja</option>
                  </select>
                </div>
                
                <div style={{ display: 'grid', gap: 6 }}>
                  <label htmlFor="rd-event-dq-rider" style={{ fontSize: 12, fontWeight: 900, color: '#475569' }}>Rider</label>
                  <select
                    id="rd-event-dq-rider"
                    value={eventDqForm.riderId}
                    onChange={(e) => handleEventDqFormChange('riderId', e.target.value)}
                    className="public-filter"
                  >
                    <option value="">Pilih rider</option>
                    {Object.values(riderMap)
                      .sort((a, b) => a.name.localeCompare(b.name))
                      .map((rider) => (
                        <option key={rider.id} value={rider.id}>
                          {rider.no_plate_display ? `#${rider.no_plate_display}` : ''} {rider.name}
                        </option>
                    ))}
                  </select>
                </div>

                {eventDqForm.scope === 'CATEGORY' && (
                  <div style={{ display: 'grid', gap: 6 }}>
                    <label htmlFor="rd-event-dq-category" style={{ fontSize: 12, fontWeight: 900, color: '#475569' }}>Pilih kategori</label>
                    <select
                      id="rd-event-dq-category"
                      value={eventDqForm.categoryId}
                      onChange={(e) => handleEventDqFormChange('categoryId', e.target.value)}
                      className="public-filter"
                    >
                      <option value="">Pilih kategori spesifik</option>
                      {categoriesSorted.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                <label htmlFor="rd-event-dq-reason" style={{ fontSize: 12, fontWeight: 900, color: '#475569' }}>Alasan diskualifikasi (wajib)</label>
                <textarea
                  id="rd-event-dq-reason"
                  value={eventDqForm.reason}
                  onChange={(e) => handleEventDqFormChange('reason', e.target.value)}
                  className="public-filter"
                  placeholder="Contoh: Manipulasi umur / data diri"
                  rows={2}
                  style={{ width: '100%', minHeight: 60 }}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={handleCancelEventDq}
                  disabled={cancellingEventDq || settingEventDq || !eventId || !eventDqForm.riderId || (eventDqForm.scope === 'CATEGORY' && !eventDqForm.categoryId)}
                  className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-extrabold uppercase tracking-[0.1em] text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {cancellingEventDq ? 'Membatalkan...' : 'Batalkan diskualifikasi'}
                </button>
                <button
                  onClick={handleSetEventDq}
                  disabled={settingEventDq || cancellingEventDq || !eventId || !eventDqForm.riderId || (eventDqForm.scope === 'CATEGORY' && !eventDqForm.categoryId)}
                  className="inline-flex items-center justify-center rounded-xl border border-red-300 bg-red-100 px-4 py-2.5 text-sm font-extrabold uppercase tracking-[0.1em] text-red-800 transition-colors hover:bg-red-200 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {settingEventDq
                    ? 'Menerapkan DQ...'
                    : eventDqForm.scope === 'CATEGORY'
                      ? 'Diskualifikasi rider di kategori ini'
                      : 'Diskualifikasi rider di seluruh event'}
                </button>
              </div>
            </div>
          </section>

          <section id="rd-penalty-review" className="public-panel-light scroll-mt-36">
            <div style={{ fontWeight: 900, fontSize: 18 }}>Batalkan penalti yang sudah disetujui</div>
            <div style={{ marginTop: 6, fontSize: 13, fontWeight: 700, color: '#475569' }}>
              Untuk koreksi hasil protes. Penalti yang dibatalkan tidak menambah poin lagi, tetapi riwayatnya tetap tersimpan.
            </div>
            <div style={{ marginTop: 12, display: 'grid', gap: 12 }}>
              <div className="rd-form-grid" style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
                <div style={{ display: 'grid', gap: 6 }}>
                  <label htmlFor="rd-penalty-review-category" style={{ fontSize: 12, fontWeight: 900, color: '#475569' }}>Kategori</label>
                  <select
                    id="rd-penalty-review-category"
                    value={penaltyReviewCategoryId}
                    onChange={(e) => {
                      setPenaltyReviewCategoryId(e.target.value)
                      setApprovedMotoPenalties([])
                    }}
                    className="public-filter"
                  >
                    <option value="">Pilih kategori</option>
                    {categoriesSorted.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div style={{ display: 'grid', gap: 6 }}>
                  <label htmlFor="rd-penalty-review-moto" style={{ fontSize: 12, fontWeight: 900, color: '#475569' }}>Moto</label>
                  <select
                    id="rd-penalty-review-moto"
                    value={penaltyReviewMotoId}
                    onChange={(e) => setPenaltyReviewMotoId(e.target.value)}
                    className="public-filter"
                  >
                    <option value="">Pilih moto</option>
                    {penaltyReviewMotos.map((moto) => (
                      <option key={moto.id} value={moto.id}>
                        {moto.moto_order}. {moto.moto_name} - {moto.status}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => void loadApprovedMotoPenalties()}
                  disabled={!penaltyReviewMotoId || loadingApprovedPenalties}
                  className="inline-flex items-center justify-center rounded-xl border border-sky-300 bg-sky-100 px-4 py-2.5 text-sm font-extrabold uppercase tracking-[0.1em] text-sky-800 transition-colors hover:bg-sky-200 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loadingApprovedPenalties ? 'Memuat...' : 'Tampilkan penalti'}
                </button>
              </div>

              {loadingApprovedPenalties ? (
                <div style={{ border: '2px dashed #111', borderRadius: 12, padding: 12, fontWeight: 900 }}>
                  Memuat penalty approved...
                </div>
              ) : approvedMotoPenalties.length === 0 ? (
                <div style={{ border: '2px dashed #111', borderRadius: 12, padding: 12, fontWeight: 800 }}>
                  Belum ada penalty approved untuk moto ini.
                </div>
              ) : (
                <div style={{ display: 'grid', gap: 10 }}>
                  {approvedMotoPenalties.map((penalty) => {
                    const rider = getApprovedPenaltyRider(penalty)
                    const riderLabel = rider ? `${rider.no_plate_display} - ${rider.name}` : penalty.rider_id
                    const reason = voidReasons[penalty.id] ?? ''
                    return (
                      <div
                        key={penalty.id}
                        style={{
                          border: '2px solid #111',
                          borderRadius: 12,
                          background: '#fff7ed',
                          padding: 12,
                          display: 'grid',
                          gap: 10,
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                          <div>
                            <div style={{ fontWeight: 950 }}>{riderLabel}</div>
                            <div style={{ marginTop: 3, fontSize: 12, fontWeight: 800, color: '#475569' }}>
                              {penalty.rule_code} | {penalty.penalty_point} poin | {timeAgo(penalty.created_at)}
                            </div>
                            {penalty.note && (
                              <div style={{ marginTop: 4, fontSize: 12, fontWeight: 700, color: '#64748b' }}>
                                Catatan: {penalty.note}
                              </div>
                            )}
                          </div>
                          <span
                            style={{
                              alignSelf: 'flex-start',
                              border: '2px solid #111',
                              borderRadius: 999,
                              background: '#dcfce7',
                              padding: '4px 10px',
                              fontSize: 12,
                              fontWeight: 950,
                            }}
                          >
                            Disetujui
                          </span>
                        </div>
                        <div className="rd-form-grid" style={{ display: 'grid', gap: 8, gridTemplateColumns: '1fr auto' }}>
                          <label className="grid gap-1 text-xs font-extrabold text-slate-600">
                            Alasan pembatalan (wajib)
                            <input
                              value={reason}
                              onChange={(e) => setVoidReasons((prev) => ({ ...prev, [penalty.id]: e.target.value }))}
                              className="public-filter"
                              placeholder="Jelaskan hasil koreksi atau protes"
                            />
                          </label>
                          <button
                            type="button"
                            onClick={() => void handleVoidPenalty(penalty.id)}
                            disabled={voidingPenaltyId === penalty.id || !reason.trim()}
                            className="inline-flex items-center justify-center rounded-xl border border-orange-300 bg-orange-100 px-4 py-2.5 text-sm font-extrabold uppercase tracking-[0.1em] text-orange-800 transition-colors hover:bg-orange-200 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {voidingPenaltyId === penalty.id ? 'Membatalkan...' : 'Batalkan penalti'}
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </section>

          <section id="rd-penalty-tools" className="public-panel-light scroll-mt-36">
            <div style={{ fontWeight: 900, fontSize: 18 }}>Kelola penalti rider</div>
            <div style={{ marginTop: 6, fontSize: 13, fontWeight: 700, color: '#475569' }}>
              Tambahkan penalti sesuai aturan yang tersedia. Gunakan catatan untuk menjelaskan kejadian.
            </div>
            <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
              <div className="rd-form-grid" style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
                <div style={{ display: 'grid', gap: 6 }}>
                  <label htmlFor="rd-penalty-category" style={{ fontSize: 12, fontWeight: 900, color: '#475569' }}>Kategori</label>
                  <select
                    id="rd-penalty-category"
                    value={penaltyForm.categoryId}
                    onChange={(e) => handlePenaltyFormChange('categoryId', e.target.value)}
                    className="public-filter"
                  >
                    <option value="">Pilih kategori</option>
                    {categoriesSorted.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div style={{ display: 'grid', gap: 6 }}>
                  <label htmlFor="rd-penalty-rider" style={{ fontSize: 12, fontWeight: 900, color: '#475569' }}>Rider</label>
                  <select
                    id="rd-penalty-rider"
                    value={penaltyForm.riderId}
                    onChange={(e) => handlePenaltyFormChange('riderId', e.target.value)}
                    className="public-filter"
                  >
                    <option value="">Pilih rider</option>
                    {categoryRiders.map((rider) => (
                      <option key={rider.id} value={rider.id}>
                        {rider.no_plate_display} - {rider.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div style={{ display: 'grid', gap: 6 }}>
                  <label htmlFor="rd-penalty-rule" style={{ fontSize: 12, fontWeight: 900, color: '#475569' }}>Aturan penalti</label>
                  <select
                    id="rd-penalty-rule"
                    value={penaltyForm.ruleCode}
                    onChange={(e) => handlePenaltyFormChange('ruleCode', e.target.value)}
                    className="public-filter"
                  >
                    <option value="">Pilih aturan penalti</option>
                    {penaltyRules.map((rule) => (
                      <option key={rule.id} value={rule.code}>
                        {rule.code} - {rule.penalty_point} poin
                      </option>
                    ))}
                  </select>
                  {selectedPenaltyRule && (
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b' }}>
                      {selectedPenaltyRule.description || 'Tanpa deskripsi'} | Berlaku pada: {penaltyStageLabel[selectedPenaltyRule.applies_to_stage] ?? selectedPenaltyRule.applies_to_stage}
                    </div>
                  )}
                </div>
                <div style={{ display: 'grid', gap: 6 }}>
                  <label htmlFor="rd-penalty-stage" style={{ fontSize: 12, fontWeight: 900, color: '#475569' }}>Tahap yang dikenai</label>
                  <select
                    id="rd-penalty-stage"
                    value={penaltyForm.stage}
                    onChange={(e) => handlePenaltyFormChange('stage', e.target.value as PenaltyFormState['stage'])}
                    className="public-filter"
                    disabled={selectedPenaltyRule?.applies_to_stage !== 'ALL'}
                  >
                    {(['ALL', 'MOTO', 'QUARTER', 'REPECHAGE', 'SEMI', 'FINAL'] as const).map((stage) => (
                      <option key={stage} value={stage}>
                        {penaltyStageLabel[stage] ?? stage}
                      </option>
                    ))}
                  </select>
                  {selectedPenaltyRule?.applies_to_stage !== 'ALL' && (
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#64748b' }}>
                      Tahap mengikuti aturan penalti yang dipilih.
                    </span>
                  )}
                </div>
                <div style={{ display: 'grid', gap: 6 }}>
                  <label htmlFor="rd-penalty-moto" style={{ fontSize: 12, fontWeight: 900, color: '#475569' }}>Moto (wajib jika tahapnya Moto)</label>
                  <select
                    id="rd-penalty-moto"
                    value={penaltyForm.motoId}
                    onChange={(e) => handlePenaltyFormChange('motoId', e.target.value)}
                    className="public-filter"
                    disabled={penaltyForm.stage !== 'MOTO'}
                  >
                    <option value="">Pilih moto</option>
                    {penaltyFormMotos.map((moto) => (
                      <option key={moto.id} value={moto.id}>
                        {moto.moto_order}. {moto.moto_name} - {motoStatusLabel[moto.status.toUpperCase()] ?? moto.status}
                      </option>
                    ))}
                  </select>
                </div>
                <div style={{ display: 'grid', gap: 6 }}>
                  <label htmlFor="rd-penalty-note" style={{ fontSize: 12, fontWeight: 900, color: '#475569' }}>Catatan</label>
                  <input
                    id="rd-penalty-note"
                    value={penaltyForm.note}
                    onChange={(e) => handlePenaltyFormChange('note', e.target.value)}
                    className="public-filter"
                    placeholder="Contoh: pelanggaran oleh wali rider di area start"
                  />
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={handleAddPenalty}
                  disabled={addingPenalty || !eventId}
                  className="inline-flex items-center justify-center rounded-xl border border-rose-300 bg-rose-100 px-4 py-2.5 text-sm font-extrabold uppercase tracking-[0.1em] text-rose-800 transition-colors hover:bg-rose-200 disabled:cursor-not-allowed disabled:opacity-60"
                >
                    {addingPenalty ? 'Menyimpan...' : 'Tambahkan penalti'}
                </button>
              </div>
            </div>
          </section>

          <section id="rd-status-updates" className="public-panel-light scroll-mt-36">
            <div style={{ fontWeight: 900, fontSize: 18 }}>Perubahan status menunggu keputusan</div>
            <p style={{ marginTop: 6, fontSize: 13, fontWeight: 700, color: '#475569' }}>
              {approvalMode === 'AUTO'
                ? 'Mode otomatis aktif; laporan status yang masuk tidak memerlukan keputusan manual di sini.'
                : 'Periksa pengajuan lalu pilih Setujui atau Tolak. Alasan keputusan dapat ditambahkan pada langkah berikutnya.'}
            </p>
            {statusUpdates.length === 0 && <div style={{ marginTop: 8 }}>Tidak ada perubahan status yang menunggu.</div>}
            <div style={{ marginTop: 10, display: 'grid', gap: 10 }}>
              {sortedStatusUpdates.map((u) => {
                const rider = riderMap[u.rider_id]
                const riderLabel = rider ? `${rider.no_plate_display} - ${rider.name}` : u.rider_id
                const statusBadge =
                  u.proposed_status === 'ABSENT'
                    ? '#fee2e2'
                    : u.proposed_status === 'DNS'
                      ? '#ffe9a8'
                      : '#bfead2'
                return (
                  <div
                    key={u.id}
                    style={{
                      border: '2px solid #111',
                      borderRadius: 12,
                      background: '#eaf7ee',
                      padding: 12,
                      display: 'grid',
                      gap: 6,
                    }}
                  >
                    <div style={{ fontWeight: 900 }}>{riderLabel}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span
                        style={{
                          padding: '4px 8px',
                          borderRadius: 999,
                          border: '2px solid #111',
                          background: statusBadge,
                          fontWeight: 900,
                          fontSize: 12,
                        }}
                      >
                          {riderStatusLabel[u.proposed_status] ?? u.proposed_status}
                      </span>
                      <span style={{ fontSize: 12, color: '#333' }}>{timeAgo(u.created_at)}</span>
                    </div>
                    <div
                      className="rd-action-grid"
                      style={{ display: 'grid', gap: 8, marginTop: 6, gridTemplateColumns: '1fr 1fr' }}
                    >
                      <button
                        disabled={approvalMode === 'AUTO'}
                        onClick={() => openDecisionModal('status', u.id, 'APPROVE')}
                        style={{
                          padding: '8px 12px',
                          borderRadius: 10,
                          border: '2px solid #111',
                          background: '#bfead2',
                          fontWeight: 900,
                          cursor: approvalMode === 'AUTO' ? 'not-allowed' : 'pointer',
                        }}
                      >
                        Setujui perubahan
                      </button>
                      <button
                        disabled={approvalMode === 'AUTO'}
                        onClick={() => openDecisionModal('status', u.id, 'REJECT')}
                        style={{
                          padding: '8px 12px',
                          borderRadius: 10,
                          border: '2px solid #111',
                          background: '#ffd7d7',
                          fontWeight: 900,
                          cursor: approvalMode === 'AUTO' ? 'not-allowed' : 'pointer',
                        }}
                      >
                        Tolak perubahan
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>

          <section id="rd-penalty-approvals" className="public-panel-light scroll-mt-36">
            <div style={{ fontWeight: 900, fontSize: 18 }}>Penalti menunggu keputusan</div>
            {approvalMode === 'AUTO' && (
              <p style={{ marginTop: 6, fontSize: 13, fontWeight: 700, color: '#475569' }}>
                Mode otomatis aktif; penalti baru diterapkan tanpa keputusan manual.
              </p>
            )}
            {penalties.length === 0 && <div style={{ marginTop: 8 }}>Tidak ada penalti yang menunggu keputusan.</div>}
            <div style={{ marginTop: 10, display: 'grid', gap: 10 }}>
              {sortedPenalties.map((p) => {
                const rider = riderMap[p.rider_id]
                const riderLabel = rider ? `${rider.no_plate_display} - ${rider.name}` : p.rider_id
                return (
                  <div
                    key={p.id}
                    style={{
                      border: '2px solid #111',
                      borderRadius: 12,
                      background: '#eaf7ee',
                      padding: 12,
                      display: 'grid',
                      gap: 6,
                    }}
                  >
                    <div style={{ fontWeight: 900 }}>{riderLabel}</div>
                    <div>Aturan: {p.rule_code} (+{p.penalty_point} poin)</div>
                    {p.note && <div style={{ fontSize: 12, color: '#333' }}>Catatan: {p.note}</div>}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 12, color: '#333' }}>{timeAgo(p.created_at)}</span>
                    </div>
                    <div
                      className="rd-action-grid"
                      style={{ display: 'grid', gap: 8, marginTop: 6, gridTemplateColumns: '1fr 1fr' }}
                    >
                      <button
                        disabled={approvalMode === 'AUTO'}
                        onClick={() => openDecisionModal('penalty', p.id, 'APPROVE')}
                        style={{
                          padding: '8px 12px',
                          borderRadius: 10,
                          border: '2px solid #111',
                          background: '#bfead2',
                          fontWeight: 900,
                          cursor: approvalMode === 'AUTO' ? 'not-allowed' : 'pointer',
                        }}
                      >
                        Setujui penalti
                      </button>
                      <button
                        disabled={approvalMode === 'AUTO'}
                        onClick={() => openDecisionModal('penalty', p.id, 'REJECT')}
                        style={{
                          padding: '8px 12px',
                          borderRadius: 10,
                          border: '2px solid #111',
                          background: '#ffd7d7',
                          fontWeight: 900,
                          cursor: approvalMode === 'AUTO' ? 'not-allowed' : 'pointer',
                        }}
                      >
                        Tolak penalti
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>

          <section id="rd-moto-lock" className="public-panel-light scroll-mt-36">
            <div style={{ fontWeight: 900, fontSize: 18 }}>Periksa dan kunci hasil moto</div>
            <p style={{ marginTop: 6, fontSize: 13, fontWeight: 700, color: '#475569' }}>
              Kunci moto setelah hasil, perubahan status, dan penalti selesai diperiksa. Moto yang terkunci tidak bisa diedit melalui alur biasa.
            </p>
            {motos.length === 0 && <div style={{ marginTop: 8 }}>Tidak ada moto.</div>}
            <div style={{ marginTop: 10, display: 'grid', gap: 10 }}>
              {categoriesSorted.map((cat) => {
                const list = motosByCategory.get(cat.id) ?? []
                if (list.length === 0) return null
                const isOpen = openCategoryId === cat.id
                return (
                  <div
                    key={cat.id}
                    style={{
                      border: '2px solid #111',
                      borderRadius: 12,
                      background: '#fff',
                      padding: 12,
                      display: 'grid',
                      gap: 8,
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => setOpenCategoryId(isOpen ? null : cat.id)}
                      aria-expanded={isOpen}
                      aria-controls={`rd-motos-${cat.id}`}
                      style={{
                        padding: '10px 12px',
                        borderRadius: 10,
                        border: '2px solid #111',
                        background: '#2ecc71',
                        fontWeight: 900,
                        cursor: 'pointer',
                        textAlign: 'left',
                      }}
                    >
                      {cat.label} · {list.length} moto {isOpen ? '−' : '+'}
                    </button>
                    {isOpen && (
                      <div id={`rd-motos-${cat.id}`} style={{ display: 'grid', gap: 8 }}>
                        {list.map((m) => {
                          const status = (m.status ?? '').toUpperCase()
                          const isLocked = status === 'LOCKED'
                          const canUnlock = isLocked && (role === 'SUPER_ADMIN' || role === 'RACE_DIRECTOR')
                          const canLock = status === 'PROVISIONAL' || status === 'PROTEST_REVIEW'
                          const lockUnavailable = !isLocked && !canLock
                          return (
                            <div
                              key={m.id}
                              style={{
                                border: '2px solid #111',
                                borderRadius: 12,
                                background: isLocked ? '#dbeafe' : '#eaf7ee',
                                padding: 12,
                                display: 'grid',
                                gap: 6,
                              }}
                            >
                              <div style={{ fontWeight: 900 }}>
                                {m.moto_order}. {m.moto_name}
                              </div>
                              <div style={{ fontSize: 12, color: '#333' }}>{m.status}</div>
                              <div
                                style={{
                                  fontSize: 11,
                                  fontWeight: 900,
                                  padding: '4px 8px',
                                  borderRadius: 999,
                                  border: '2px solid #111',
                                  background:
                                    status === 'LOCKED'
                                      ? '#93c5fd'
                                      : status === 'PROVISIONAL'
                                        ? '#ffe9a8'
                                        : status === 'PROTEST_REVIEW'
                                          ? '#ffd7d7'
                                          : '#bfead2',
                                  width: 'fit-content',
                                }}
                              >
                                {(motoStatusLabel[status] ?? status) || 'Status tidak diketahui'}
                              </div>
                              {status === 'LIVE' && (
                                <div
                                  style={{
                                    fontSize: 11,
                                    fontWeight: 900,
                                    padding: '4px 8px',
                                    borderRadius: 999,
                                    border: '2px solid #111',
                                    background: '#ffe9a8',
                                    width: 'fit-content',
                                  }}
                                >
                                  Race sedang berjalan
                                </div>
                              )}
                              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                {lockUnavailable && (
                                  <span style={{ fontSize: 12, fontWeight: 700, color: '#475569' }}>
                                    Belum bisa dikunci. Tunggu sampai hasil moto berstatus sementara atau sedang ditinjau.
                                  </span>
                                )}
                                {canLock && (
                                  <button
                                    onClick={() => handleLock(m.id, true)}
                                    style={{
                                      padding: '8px 12px',
                                      borderRadius: 10,
                                      border: '2px solid #111',
                                      background: '#ffd7d7',
                                      fontWeight: 900,
                                      cursor: 'pointer',
                                    }}
                                  >
                                    Kunci
                                  </button>
                                )}
                                {canUnlock && (
                                  <button
                                    onClick={() => handleLock(m.id, false)}
                                    style={{
                                      padding: '8px 12px',
                                      borderRadius: 10,
                                      border: '2px solid #b40000',
                                      background: '#ffd7d7',
                                      color: '#b40000',
                                      fontWeight: 900,
                                      cursor: 'pointer',
                                    }}
                                  >
                                    Buka Kunci
                                  </button>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </section>

          <section id="rd-audit" className="public-panel-light scroll-mt-36">
            <div className="rd-section-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
              <div style={{ fontWeight: 900, fontSize: 18 }}>Riwayat tindakan (100 terbaru)</div>
              <button
                type="button"
                onClick={() => setShowAuditLogs((prev) => !prev)}
                style={{
                  padding: '6px 10px',
                  borderRadius: 10,
                  border: '2px solid #111',
                  background: '#fff',
                  fontWeight: 900,
                  cursor: 'pointer',
                }}
              >
                {showAuditLogs ? 'Sembunyikan' : 'Tampilkan'}
              </button>
            </div>
            {showAuditLogs && (
              <>
                {auditLogs.length === 0 && <div style={{ marginTop: 8 }}>Belum ada log audit.</div>}
                <div style={{ marginTop: 10, display: 'grid', gap: 10 }}>
                  {auditLogs.map((log) => (
                    <div
                      key={log.id}
                      style={{
                        border: '2px solid #111',
                        borderRadius: 12,
                        background: '#fff',
                        padding: 12,
                        display: 'grid',
                        gap: 4,
                      }}
                    >
                      <div style={{ fontWeight: 900 }}>
                        {new Date(log.created_at).toLocaleString()} - {log.action_type}
                      </div>
                      <div style={{ fontSize: 12, color: '#333' }}>
                        Oleh: {log.performed_by}
                        {log.rider_id ? ` - Rider: ${log.rider_id}` : ''}
                        {log.moto_id ? ` - Moto: ${log.moto_id}` : ''}
                      </div>
                      {log.reason && <div style={{ fontSize: 12, color: '#333' }}>Alasan: {log.reason}</div>}
                    </div>
                  ))}
                </div>
              </>
            )}
          </section>
        </div>
          </>
        )}
      </main>
      {decisionModal && (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-slate-900/55 p-4">
          <div className="w-full max-w-[560px] rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
            <div className="grid gap-2">
              <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-slate-500">Catatan Keputusan</p>
              <h2 className="text-xl font-black text-slate-900">
                {decisionModal.decision === 'APPROVE' ? 'Setujui' : 'Tolak'}{' '}
                {decisionModal.type === 'status' ? 'Perubahan status' : 'Penalti'}
              </h2>
              <p className="text-sm font-semibold text-slate-600">
                Tambahkan alasan (opsional) lalu konfirmasi aksi.
              </p>
            </div>
            <div className="mt-4 grid gap-2">
              <label className="text-xs font-extrabold uppercase tracking-[0.1em] text-slate-500">Alasan (opsional)</label>
              <textarea
                value={decisionModal.reason}
                onChange={(e) =>
                  setDecisionModal((prev) => (prev ? { ...prev, reason: e.target.value } : prev))
                }
                rows={4}
                disabled={decisionSubmitting}
                className="w-full resize-y rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 outline-none ring-0 focus:border-slate-500"
                placeholder="Contoh: rider tidak hadir di gate, bukti dari checker..."
              />
            </div>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setDecisionModal(null)}
                disabled={decisionSubmitting}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-extrabold uppercase tracking-[0.1em] text-slate-700 transition-colors hover:bg-slate-100"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSubmitDecision}
                disabled={decisionSubmitting}
                className={`rounded-xl border px-4 py-2.5 text-sm font-extrabold uppercase tracking-[0.1em] transition-colors ${decisionModal.decision === 'APPROVE'
                    ? 'border-emerald-300 bg-emerald-500 text-white hover:bg-emerald-400'
                    : 'border-amber-300 bg-amber-400 text-white hover:bg-amber-300'
                  }`}
              >
                {decisionSubmitting
                  ? 'Memproses...'
                  : `Konfirmasi ${decisionModal.decision === 'APPROVE' ? 'Setujui' : 'Tolak'}`}
              </button>
            </div>
          </div>
        </div>
      )}
      <style jsx>{`
        @media (max-width: 640px) {
          .rd-form-grid {
            grid-template-columns: 1fr;
          }
          .rd-action-grid {
            grid-template-columns: 1fr;
          }
          .rd-gate-row {
            flex-direction: column;
            align-items: flex-start;
          }
          .rd-gate-meta {
            width: 100%;
          }
          .rd-section-head {
            flex-direction: column;
            align-items: flex-start;
          }
        }
      `}</style>
    </div>
  )
}


