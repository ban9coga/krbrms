'use client'

import { useEffect, useMemo, useState, type DragEvent } from 'react'
import SponsorMarquee from '../../../../../components/SponsorMarquee'
import { formatAppRoleLabel } from '../../../../../lib/roles'
import { supabase } from '../../../../../lib/supabaseClient'
import type { BusinessSettings, EventSponsor, EventSponsorTier } from '../../../../../lib/eventService'

type SettingsRow = {
  event_id: string
  event_logo_url: string | null
  sponsor_logo_urls: string[]
  base_price?: number | null
  extra_price?: number | null
  ffa_mix_min_year?: number | null
  ffa_mix_max_year?: number | null
  require_jersey_size?: boolean | null
  scoring_rules: Record<string, unknown>
  display_theme: Record<string, unknown>
  race_format_settings: Record<string, unknown>
  business_settings: BusinessSettings
  updated_at?: string | null
}

type EventStaffAssignmentRow = {
  id?: string
  user_id: string
  email?: string | null
  global_role?: string
  role: string
  is_active: boolean
  notes?: string | null
}

type EventStaffUserRow = {
  id: string
  email: string | null
  global_role: string
}

type AdvancedCategory = {
  id: string
  year: number
  gender: 'BOY' | 'GIRL' | 'MIX'
  label: string
  enabled: boolean
}

type AdvancedConfig = {
  id: string
  event_id: string
  category_id: string
  enabled: boolean
  max_riders_per_race: number
  qualification_moto_count: number
}

type CategoryRule = {
  id?: string
  category_id: string
  min_riders: number
  enable_qualification: boolean
  enable_quarter_final: boolean
  enable_semi_final: boolean
  enabled_final_classes: string[]
}

type StageResultRow = {
  id: string
  rider_id: string
  category_id: string
  stage: 'QUALIFICATION' | 'QUARTER_FINAL' | 'SEMI_FINAL' | 'FINAL'
  batch_id: string | null
  final_class: string | null
  position: number | null
  points: number | null
  riders: { name: string; no_plate_display: string } | null
}

type SponsorDraft = {
  id: string
  name: string
  tier: EventSponsorTier
  logo_url: string
  website_url: string
  instagram_url: string
  sort_order: string
  is_active: boolean
  show_on_event_page: boolean
  show_on_live_display: boolean
}

const sponsorTierOptions: EventSponsorTier[] = ['TITLE', 'MAIN', 'SUPPORT', 'MEDIA', 'COMMUNITY', 'PARTNER']
const advancedFinalClassOrder = ['ROOKIE', 'BEGINNER', 'NOVICE', 'AMATEUR', 'INTERMEDIATE', 'ADVANCED', 'PRO', 'ELITE'] as const
const legacyAdvancedFinalClasses = ['ACADEMY'] as const

const buildStandardBatchRules = (gateSize: number): CategoryRule[] => {
  const safeGateSize = Math.max(1, gateSize || 8)
  const eliteOnly = ['ELITE']
  const qualificationFinals = ['ROOKIE', 'BEGINNER', 'NOVICE', 'AMATEUR', 'ELITE']
  const semiFinals = ['ROOKIE', 'BEGINNER', 'NOVICE', 'AMATEUR', 'PRO', 'ELITE']
  const fullFinals = [...advancedFinalClassOrder]

  return [
    {
      category_id: '',
      min_riders: 1,
      enable_qualification: false,
      enable_quarter_final: false,
      enable_semi_final: false,
      enabled_final_classes: eliteOnly,
    },
    {
      category_id: '',
      min_riders: safeGateSize + 1,
      enable_qualification: true,
      enable_quarter_final: false,
      enable_semi_final: false,
      enabled_final_classes: qualificationFinals,
    },
    {
      category_id: '',
      min_riders: safeGateSize * 2 + 1,
      enable_qualification: true,
      enable_quarter_final: false,
      enable_semi_final: true,
      enabled_final_classes: semiFinals,
    },
    {
      category_id: '',
      min_riders: safeGateSize * 3 + 1,
      enable_qualification: true,
      enable_quarter_final: false,
      enable_semi_final: true,
      enabled_final_classes: semiFinals,
    },
    {
      category_id: '',
      min_riders: safeGateSize * 4 + 1,
      enable_qualification: true,
      enable_quarter_final: true,
      enable_semi_final: true,
      enabled_final_classes: fullFinals,
    },
    {
      category_id: '',
      min_riders: safeGateSize * 5 + 1,
      enable_qualification: true,
      enable_quarter_final: true,
      enable_semi_final: true,
      enabled_final_classes: fullFinals,
    },
    {
      category_id: '',
      min_riders: safeGateSize * 6 + 1,
      enable_qualification: true,
      enable_quarter_final: true,
      enable_semi_final: true,
      enabled_final_classes: fullFinals,
    },
    {
      category_id: '',
      min_riders: safeGateSize * 7 + 1,
      enable_qualification: true,
      enable_quarter_final: true,
      enable_semi_final: true,
      enabled_final_classes: fullFinals,
    },
  ]
}

const standardBatchPresetCards = (gateSize: number) => {
  const safeGateSize = Math.max(1, gateSize || 8)
  return [
    {
      label: '1 Batch',
      riderRange: `1-${safeGateSize} rider`,
      summary: '3 moto final biasa',
      finals: ['ELITE'],
    },
    {
      label: '2 Batch',
      riderRange: `${safeGateSize + 1}-${safeGateSize * 2} rider`,
      summary: 'Qualification -> Final Elite',
      finals: ['ROOKIE', 'BEGINNER', 'NOVICE', 'AMATEUR', 'ELITE'],
    },
    {
      label: '3 Batch',
      riderRange: `${safeGateSize * 2 + 1}-${safeGateSize * 3} rider`,
      summary: 'Qualification -> Semi Final -> Final Elite/Pro',
      finals: ['ROOKIE', 'BEGINNER', 'NOVICE', 'AMATEUR', 'PRO', 'ELITE'],
    },
    {
      label: '4 Batch',
      riderRange: `${safeGateSize * 3 + 1}-${safeGateSize * 4} rider`,
      summary: 'Qualification -> Semi Final -> Final Elite/Pro',
      finals: ['ROOKIE', 'BEGINNER', 'NOVICE', 'AMATEUR', 'PRO', 'ELITE'],
    },
    {
      label: '5 Batch',
      riderRange: `${safeGateSize * 4 + 1}-${safeGateSize * 5} rider`,
      summary: 'Qualification -> Quarter -> Semi -> Finals lengkap',
      finals: [...advancedFinalClassOrder],
    },
    {
      label: '6 Batch',
      riderRange: `${safeGateSize * 5 + 1}-${safeGateSize * 6} rider`,
      summary: 'Qualification -> Quarter -> Semi -> Finals lengkap',
      finals: [...advancedFinalClassOrder],
    },
    {
      label: '7 Batch',
      riderRange: `${safeGateSize * 6 + 1}-${safeGateSize * 7} rider`,
      summary: 'Qualification -> Quarter -> Semi -> Finals lengkap',
      finals: [...advancedFinalClassOrder],
    },
    {
      label: '8 Batch',
      riderRange: `${safeGateSize * 7 + 1}-${safeGateSize * 8} rider`,
      summary: 'Qualification -> Quarter -> Semi -> Finals lengkap',
      finals: [...advancedFinalClassOrder],
    },
  ]
}

const createEmptySponsorDraft = (index = 0): SponsorDraft => ({
  id: '',
  name: '',
  tier: 'SUPPORT',
  logo_url: '',
  website_url: '',
  instagram_url: '',
  sort_order: String(index + 1),
  is_active: true,
  show_on_event_page: true,
  show_on_live_display: true,
})

const sponsorDraftFromItem = (item: Partial<EventSponsor>, index: number): SponsorDraft => ({
  id: typeof item.id === 'string' ? item.id : '',
  name: typeof item.name === 'string' ? item.name : '',
  tier: (typeof item.tier === 'string' ? item.tier : 'SUPPORT') as EventSponsorTier,
  logo_url: typeof item.logo_url === 'string' ? item.logo_url : '',
  website_url: typeof item.website_url === 'string' ? item.website_url : '',
  instagram_url: typeof item.instagram_url === 'string' ? item.instagram_url : '',
  sort_order:
    typeof item.sort_order === 'number'
      ? String(item.sort_order)
      : typeof item.sort_order === 'string'
      ? item.sort_order
      : String(index + 1),
  is_active: typeof item.is_active === 'boolean' ? item.is_active : true,
  show_on_event_page:
    typeof item.show_on_event_page === 'boolean' ? item.show_on_event_page : true,
  show_on_live_display:
    typeof item.show_on_live_display === 'boolean' ? item.show_on_live_display : true,
})

const reindexSponsorDrafts = (items: SponsorDraft[]): SponsorDraft[] =>
  items.map((item, index) => ({
    ...item,
    sort_order: String(index + 1),
  }))

const sortSponsorDrafts = (items: SponsorDraft[]): SponsorDraft[] =>
  reindexSponsorDrafts(
    [...items].sort((a, b) => {
      const aOrder = Number(a.sort_order)
      const bOrder = Number(b.sort_order)
      const safeA = Number.isFinite(aOrder) && aOrder > 0 ? aOrder : Number.MAX_SAFE_INTEGER
      const safeB = Number.isFinite(bOrder) && bOrder > 0 ? bOrder : Number.MAX_SAFE_INTEGER
      return safeA - safeB
    })
  )

const moveSponsorDrafts = (items: SponsorDraft[], fromIndex: number, toIndex: number): SponsorDraft[] => {
  if (
    fromIndex === toIndex ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= items.length ||
    toIndex >= items.length
  ) {
    return items
  }
  const next = [...items]
  const [moved] = next.splice(fromIndex, 1)
  if (!moved) return items
  next.splice(toIndex, 0, moved)
  return reindexSponsorDrafts(next)
}

const sanitizeSponsorDrafts = (items: SponsorDraft[]): EventSponsor[] =>
  items
    .map((item, index) => {
      const logoUrl = item.logo_url.trim()
      const name = item.name.trim() || `Sponsor ${index + 1}`
      if (!logoUrl) return null
      return {
        id: item.id.trim() || `sponsor-${index + 1}`,
        name,
        tier: item.tier,
        logo_url: logoUrl,
        website_url: item.website_url.trim() || null,
        instagram_url: item.instagram_url.trim() || null,
        sort_order: Number(item.sort_order) || index + 1,
        is_active: Boolean(item.is_active),
        show_on_event_page: Boolean(item.show_on_event_page),
        show_on_live_display: Boolean(item.show_on_live_display),
      } satisfies EventSponsor
    })
    .filter(Boolean) as EventSponsor[]

const safeJsonParse = (value: string) => {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

export default function SettingsClient({ eventId }: { eventId: string }) {
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [row, setRow] = useState<SettingsRow | null>(null)
  const [advancedLoading, setAdvancedLoading] = useState(false)
  const [advancedSaving, setAdvancedSaving] = useState(false)
  const [advancedItems, setAdvancedItems] = useState<
    Array<{ category: AdvancedCategory; config: AdvancedConfig | null }>
  >([])
  const [rulesByCategory, setRulesByCategory] = useState<Record<string, CategoryRule[]>>({})
  const [draftRules, setDraftRules] = useState<Record<string, CategoryRule>>({})
  const [stagePreview, setStagePreview] = useState<Record<string, StageResultRow[]>>({})
  const [previewLoading, setPreviewLoading] = useState<Record<string, boolean>>({})
  const [previewOpen, setPreviewOpen] = useState<Record<string, boolean>>({})
  const [summaryByCategory, setSummaryByCategory] = useState<
    Record<
      string,
      { stageCounts: Record<string, number>; motoCounts: { quarter: number; semi: number; final: number } }
    >
  >({})
  const [sections, setSections] = useState<{ basic: boolean; business: boolean; appearance: boolean; advanced: boolean }>({
    basic: true,
    business: false,
    appearance: false,
    advanced: false,
  })
  const [advancedOpen, setAdvancedOpen] = useState<Record<string, boolean>>({})
  const [initialForm, setInitialForm] = useState<string>('')
  const [logoUploading, setLogoUploading] = useState(false)
  const [logoError, setLogoError] = useState<string>('')
  const [staffLoading, setStaffLoading] = useState(false)
  const [staffSaving, setStaffSaving] = useState(false)
  const [staffAssignments, setStaffAssignments] = useState<EventStaffAssignmentRow[]>([])
  const [availableUsers, setAvailableUsers] = useState<EventStaffUserRow[]>([])
  const [staffSearch, setStaffSearch] = useState('')
  const [sponsorItems, setSponsorItems] = useState<SponsorDraft[]>([])
  const [sponsorSectionEnabled, setSponsorSectionEnabled] = useState(true)
  const [sponsorSectionTitle, setSponsorSectionTitle] = useState('Official Sponsors')
  const [sponsorSectionSubtitle, setSponsorSectionSubtitle] = useState(
    'Partner dan sponsor yang ikut mendukung event ini.'
  )
  const [sponsorUploadingIndex, setSponsorUploadingIndex] = useState<number | null>(null)
  const [sponsorUploadError, setSponsorUploadError] = useState<{ index: number | null; message: string }>({
    index: null,
    message: '',
  })
  const [dragSponsorIndex, setDragSponsorIndex] = useState<number | null>(null)
  const [dragOverSponsorIndex, setDragOverSponsorIndex] = useState<number | null>(null)

  const [form, setForm] = useState({
    event_logo_url: '',
    sponsor_logo_urls: '',
    base_price: '250000',
    extra_price: '150000',
    ffa_mix_min_year: '2017',
    ffa_mix_max_year: '2017',
    require_jersey_size: false,
    scoring_base_mode: 'finish_order',
    scoring_dns_points: '9',
    scoring_dnf_points: 'last',
    scoring_dq_threshold: '7',
    scoring_tie_breaker: 'last_best',
    display_primary_color: '#2ecc71',
    display_secondary_color: '#111111',
    display_header_bg: '#eaf7ee',
    display_card_bg: '#ffffff',
    display_logo_url: '',
    display_slogan: '',
    business_public_brand_name: '',
    business_public_event_title: '',
    business_public_tagline: '',
    business_whatsapp_group_invite_url: '',
    business_payment_bank_name: '',
    business_payment_account_name: '',
    business_payment_account_number: '',
    business_event_owner_name: '',
    business_event_owner_type: 'COMMUNITY',
    business_operating_committee_name: '',
    business_operating_committee_label: '',
    business_scoring_support_name: '',
    business_scoring_support_label: '',
    business_central_control_enabled: true,
    business_requires_platform_approval: false,
    business_show_event_owner_publicly: false,
    business_show_operating_committee_publicly: true,
    business_show_scoring_support_publicly: true,
    race_moto_per_batch: '3',
    race_gate_positions: '8',
    race_qualification_enabled: true,
    race_auto_advance: true,
    race_final_classes: 'ELITE,PRO,ADVANCED,INTERMEDIATE,AMATEUR,NOVICE,BEGINNER,ROOKIE',
    scoring_rules: '{\n}\n',
    display_theme: '{\n}\n',
    race_format_settings: '{\n}\n',
  })

  const apiFetch = async (url: string, options: RequestInit = {}) => {
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (token) headers.Authorization = `Bearer ${token}`
    const res = await fetch(url, { ...options, headers })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(json?.error || 'Request failed')
    return json
  }

  const uploadLogo = async (file: File) => {
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    if (!token) throw new Error('Session expired. Silakan login ulang.')
    const body = new FormData()
    body.append('file', file)
    const res = await fetch(`/api/events/${eventId}/logo`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body,
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(json?.error || 'Gagal upload logo.')
    return json?.url as string
  }

  const uploadSponsorLogo = async (file: File) => {
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    if (!token) throw new Error('Session expired. Silakan login ulang.')
    const body = new FormData()
    body.append('file', file)
    const res = await fetch(`/api/events/${eventId}/sponsor-logo`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body,
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(json?.error || 'Gagal upload logo sponsor.')
    return json?.url as string
  }

  const loadStaffAssignments = async () => {
    if (!eventId) return
    setStaffLoading(true)
    try {
      const res = await apiFetch(`/api/events/${eventId}/staff-roles`)
      setStaffAssignments((res.data?.assignments ?? []) as EventStaffAssignmentRow[])
      setAvailableUsers((res.data?.users ?? []) as EventStaffUserRow[])
    } catch (err) {
      console.warn(err)
      setStaffAssignments([])
      setAvailableUsers([])
    } finally {
      setStaffLoading(false)
    }
  }

  const load = async () => {
    if (!eventId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/events/${eventId}/settings`)
      const json = await res.json()
      const data = json.data as SettingsRow | null
      setRow(data)
      if (data) {
        const scoring = (data.scoring_rules ?? {}) as Record<string, unknown>
        const theme = (data.display_theme ?? {}) as Record<string, unknown>
        const format = (data.race_format_settings ?? {}) as Record<string, unknown>
        const business = (data.business_settings ?? {}) as BusinessSettings
        const loadedSponsors = sortSponsorDrafts(
          Array.isArray(business.sponsors) && business.sponsors.length > 0
            ? business.sponsors.map((item, index) => sponsorDraftFromItem(item, index))
            : (data.sponsor_logo_urls ?? []).map((logoUrl, index) =>
                sponsorDraftFromItem({ logo_url: logoUrl, sort_order: index + 1 }, index)
              )
        )
        const nextForm = {
          event_logo_url: data.event_logo_url ?? '',
          sponsor_logo_urls: (data.sponsor_logo_urls ?? []).join('\n'),
          base_price: typeof data.base_price === 'number' ? String(data.base_price) : '250000',
          extra_price: typeof data.extra_price === 'number' ? String(data.extra_price) : '150000',
          ffa_mix_min_year:
            typeof data.ffa_mix_min_year === 'number' ? String(data.ffa_mix_min_year) : '2017',
          ffa_mix_max_year:
            typeof data.ffa_mix_max_year === 'number' ? String(data.ffa_mix_max_year) : '2017',
          require_jersey_size: Boolean(data.require_jersey_size),
          scoring_base_mode:
            typeof scoring.base_points_mode === 'string' ? scoring.base_points_mode : 'finish_order',
          scoring_dns_points:
            typeof scoring.dns_points === 'number' ? String(scoring.dns_points) : '9',
          scoring_dnf_points:
            typeof scoring.dnf_points === 'number'
              ? String(scoring.dnf_points)
              : typeof scoring.dnf_points === 'string'
              ? scoring.dnf_points
              : 'last',
          scoring_dq_threshold:
            typeof scoring.dq_penalty_threshold === 'number'
              ? String(scoring.dq_penalty_threshold)
              : '7',
          scoring_tie_breaker:
            typeof scoring.tie_breaker === 'string' ? scoring.tie_breaker : 'last_best',
          display_primary_color:
            typeof theme.primary_color === 'string' ? theme.primary_color : '#2ecc71',
          display_secondary_color:
            typeof theme.secondary_color === 'string' ? theme.secondary_color : '#111111',
          display_header_bg:
            typeof theme.header_bg === 'string' ? theme.header_bg : '#eaf7ee',
          display_card_bg:
            typeof theme.card_bg === 'string' ? theme.card_bg : '#ffffff',
          display_logo_url:
            typeof theme.logo_url === 'string' ? theme.logo_url : '',
          display_slogan:
            typeof theme.slogan === 'string' ? theme.slogan : '',
          business_public_brand_name:
            typeof business.public_brand_name === 'string' ? business.public_brand_name : '',
          business_public_event_title:
            typeof business.public_event_title === 'string' ? business.public_event_title : '',
          business_public_tagline:
            typeof business.public_tagline === 'string' ? business.public_tagline : '',
          business_whatsapp_group_invite_url:
            typeof business.whatsapp_group_invite_url === 'string' ? business.whatsapp_group_invite_url : '',
          business_payment_bank_name:
            typeof business.payment_bank_name === 'string' ? business.payment_bank_name : '',
          business_payment_account_name:
            typeof business.payment_account_name === 'string' ? business.payment_account_name : '',
          business_payment_account_number:
            typeof business.payment_account_number === 'string' ? business.payment_account_number : '',
          business_event_owner_name:
            typeof business.event_owner_name === 'string' ? business.event_owner_name : '',
          business_event_owner_type:
            typeof business.event_owner_type === 'string' ? business.event_owner_type : 'COMMUNITY',
          business_operating_committee_name:
            typeof business.operating_committee_name === 'string' ? business.operating_committee_name : '',
          business_operating_committee_label:
            typeof business.operating_committee_label === 'string' ? business.operating_committee_label : '',
          business_scoring_support_name:
            typeof business.scoring_support_name === 'string' ? business.scoring_support_name : '',
          business_scoring_support_label:
            typeof business.scoring_support_label === 'string' ? business.scoring_support_label : '',
          business_central_control_enabled:
            typeof business.central_control_enabled === 'boolean' ? business.central_control_enabled : true,
          business_requires_platform_approval:
            typeof business.requires_platform_approval === 'boolean' ? business.requires_platform_approval : false,
          business_show_event_owner_publicly:
            typeof business.show_event_owner_publicly === 'boolean' ? business.show_event_owner_publicly : false,
          business_show_operating_committee_publicly:
            typeof business.show_operating_committee_publicly === 'boolean' ? business.show_operating_committee_publicly : true,
          business_show_scoring_support_publicly:
            typeof business.show_scoring_support_publicly === 'boolean' ? business.show_scoring_support_publicly : true,
          race_moto_per_batch:
            typeof format.moto_per_batch === 'number' ? String(format.moto_per_batch) : '3',
          race_gate_positions:
            typeof format.gate_positions === 'number' ? String(format.gate_positions) : '8',
          race_qualification_enabled:
            typeof format.qualification_enabled === 'boolean' ? format.qualification_enabled : true,
          race_auto_advance:
            typeof format.auto_advance === 'boolean' ? format.auto_advance : true,
          race_final_classes:
            Array.isArray(format.final_classes)
              ? format.final_classes.join(',')
              : 'ELITE,PRO,ADVANCED,INTERMEDIATE,AMATEUR,NOVICE,BEGINNER,ROOKIE',
          scoring_rules: JSON.stringify(data.scoring_rules ?? {}, null, 2),
          display_theme: JSON.stringify(data.display_theme ?? {}, null, 2),
          race_format_settings: JSON.stringify(data.race_format_settings ?? {}, null, 2),
        }
        setForm(nextForm)
        setSponsorItems(loadedSponsors)
        setSponsorSectionEnabled(
          typeof business.sponsor_section_enabled === 'boolean' ? business.sponsor_section_enabled : true
        )
        setSponsorSectionTitle(
          typeof business.sponsor_section_title === 'string' && business.sponsor_section_title.trim()
            ? business.sponsor_section_title
            : 'Official Sponsors'
        )
        setSponsorSectionSubtitle(
          typeof business.sponsor_section_subtitle === 'string' && business.sponsor_section_subtitle.trim()
            ? business.sponsor_section_subtitle
            : 'Partner dan sponsor yang ikut mendukung event ini.'
        )
        setInitialForm(
          JSON.stringify({
            ...nextForm,
            sponsorSectionEnabled:
              typeof business.sponsor_section_enabled === 'boolean' ? business.sponsor_section_enabled : true,
            sponsorSectionTitle:
              typeof business.sponsor_section_title === 'string' ? business.sponsor_section_title : '',
            sponsorSectionSubtitle:
              typeof business.sponsor_section_subtitle === 'string' ? business.sponsor_section_subtitle : '',
            sponsorItems: loadedSponsors,
          })
        )
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    loadAdvanced()
    loadStaffAssignments()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId])

  const loadAdvanced = async () => {
    if (!eventId) return
    setAdvancedLoading(true)
    try {
      const res = await apiFetch(`/api/events/${eventId}/advanced-race`)
      const categories = (res.data?.categories ?? []) as AdvancedCategory[]
      const configs = (res.data?.configs ?? []) as AdvancedConfig[]
      const rules = (res.data?.rules ?? []) as CategoryRule[]
      const configMap = new Map(configs.map((c) => [c.category_id, c]))
      const merged = categories.map((c) => ({ category: c, config: configMap.get(c.id) ?? null }))
      setAdvancedItems(merged)
      const grouped: Record<string, CategoryRule[]> = {}
      for (const rule of rules) {
        if (!grouped[rule.category_id]) grouped[rule.category_id] = []
        grouped[rule.category_id].push({
          category_id: rule.category_id,
          min_riders: Number(rule.min_riders),
          enable_qualification: Boolean(rule.enable_qualification),
          enable_quarter_final: Boolean(rule.enable_quarter_final),
          enable_semi_final: Boolean(rule.enable_semi_final),
          enabled_final_classes: Array.isArray(rule.enabled_final_classes) ? rule.enabled_final_classes : [],
        })
      }
      setRulesByCategory(grouped)
      const summaryRes = await apiFetch(`/api/events/${eventId}/advanced-race/summary`)
      setSummaryByCategory((summaryRes.data ?? {}) as Record<string, { stageCounts: Record<string, number>; motoCounts: { quarter: number; semi: number; final: number } }>)
    } catch (err) {
      console.warn(err)
    } finally {
      setAdvancedLoading(false)
    }
  }

  const saveAdvanced = async (categoryId: string, enabled: boolean) => {
    if (!eventId) return
    setAdvancedSaving(true)
    try {
      await apiFetch(`/api/events/${eventId}/advanced-race`, {
        method: 'POST',
        body: JSON.stringify({
          category_id: categoryId,
          enabled,
        }),
      })
      await loadAdvanced()
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Gagal menyimpan advanced config.')
    } finally {
      setAdvancedSaving(false)
    }
  }

  const runQualification = async (categoryId: string) => {
    if (!eventId) return
    setAdvancedSaving(true)
    try {
      const res = await apiFetch(`/api/events/${eventId}/advanced-race/compute`, {
        method: 'POST',
        body: JSON.stringify({ category_id: categoryId }),
      })
      if (res?.warning) {
        alert(res.warning)
      } else {
        alert('Qualification berhasil dihitung.')
      }
      await loadStagePreview(categoryId)
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Gagal menghitung qualification.')
    } finally {
      setAdvancedSaving(false)
    }
  }

  const runAdvances = async (categoryId: string) => {
    if (!eventId) return
    setAdvancedSaving(true)
    try {
      const res = await apiFetch(`/api/events/${eventId}/advanced-race/advance`, {
        method: 'POST',
        body: JSON.stringify({ category_id: categoryId }),
      })
      if (res?.warning) {
        alert(res.warning)
      } else {
        alert('Advance stages berhasil dihitung.')
      }
      await loadStagePreview(categoryId)
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Gagal menghitung advance stages.')
    } finally {
      setAdvancedSaving(false)
    }
  }

  const loadStagePreview = async (categoryId: string) => {
    if (!eventId) return
    setPreviewLoading((prev) => ({ ...prev, [categoryId]: true }))
    try {
      const res = await apiFetch(`/api/events/${eventId}/advanced-race/results?category_id=${categoryId}`)
      setStagePreview((prev) => ({ ...prev, [categoryId]: (res.data ?? []) as StageResultRow[] }))
    } catch (err) {
      console.warn(err)
    } finally {
      setPreviewLoading((prev) => ({ ...prev, [categoryId]: false }))
    }
  }

  const togglePreview = async (categoryId: string) => {
    setPreviewOpen((prev) => ({ ...prev, [categoryId]: !prev[categoryId] }))
    if (!stagePreview[categoryId]) {
      await loadStagePreview(categoryId)
    }
  }

  const updateDraft = (categoryId: string, patch: Partial<Omit<CategoryRule, 'category_id'>>) => {
    setDraftRules((prev) => {
      const { category_id: _omit, ...prevRest } = prev[categoryId] ?? {}
      const { category_id: _omitPatch, ...patchRest } = patch as Partial<CategoryRule>
      const next = {
        ...prevRest,
        ...patchRest,
      } as CategoryRule

      if (next.min_riders == null) next.min_riders = 8
      if (next.enable_qualification == null) next.enable_qualification = true
      if (next.enable_quarter_final == null) next.enable_quarter_final = true
      if (next.enable_semi_final == null) next.enable_semi_final = true
      if (!next.enabled_final_classes) next.enabled_final_classes = []
      next.category_id = categoryId

      return {
        ...prev,
        [categoryId]: next,
      }
    })
  }

  const addRule = (categoryId: string) => {
    const draft = draftRules[categoryId]
    if (!draft) return
    setRulesByCategory((prev) => ({
      ...prev,
      [categoryId]: [...(prev[categoryId] ?? []), { ...draft }],
    }))
  }

  const removeRule = (categoryId: string, index: number) => {
    setRulesByCategory((prev) => ({
      ...prev,
      [categoryId]: (prev[categoryId] ?? []).filter((_, i) => i !== index),
    }))
  }

  const applyStandardBatchRules = (categoryId: string) => {
    const gateSize = Math.max(1, Number(form.race_gate_positions) || 8)
    const standardRules = buildStandardBatchRules(gateSize).map((rule) => ({
      ...rule,
      category_id: categoryId,
    }))
    setRulesByCategory((prev) => ({
      ...prev,
      [categoryId]: standardRules,
    }))
    updateDraft(categoryId, {
      min_riders: gateSize + 1,
      enable_qualification: true,
      enable_quarter_final: false,
      enable_semi_final: false,
      enabled_final_classes: ['ROOKIE', 'BEGINNER', 'NOVICE', 'AMATEUR', 'ELITE'],
    })
  }

  const saveRules = async (categoryId: string) => {
    if (!eventId) return
    setAdvancedSaving(true)
    try {
      const rules = rulesByCategory[categoryId] ?? []
      await apiFetch(`/api/events/${eventId}/advanced-race/rules`, {
        method: 'POST',
        body: JSON.stringify({ category_id: categoryId, rules }),
      })
      await loadAdvanced()
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Gagal menyimpan rules.')
    } finally {
      setAdvancedSaving(false)
    }
  }

  const addStaffAssignment = () => {
    setStaffAssignments((prev) => [
      ...prev,
      {
        user_id: '',
        email: null,
        global_role: '',
        role: 'CHECKER',
        is_active: true,
        notes: '',
      },
    ])
  }

  const updateStaffAssignment = (index: number, patch: Partial<EventStaffAssignmentRow>) => {
    setStaffAssignments((prev) =>
      prev.map((item, idx) => {
        if (idx !== index) return item
        const next = { ...item, ...patch }
        if (patch.user_id) {
          const matchedUser = availableUsers.find((user) => user.id === patch.user_id)
          next.email = matchedUser?.email ?? null
          next.global_role = matchedUser?.global_role ?? ''
        }
        return next
      })
    )
  }

  const removeStaffAssignment = (index: number) => {
    setStaffAssignments((prev) => prev.filter((_, idx) => idx !== index))
  }

  const addSponsorItem = () => {
    setSponsorItems((prev) => reindexSponsorDrafts([...prev, createEmptySponsorDraft(prev.length)]))
  }

  const updateSponsorItem = (index: number, patch: Partial<SponsorDraft>) => {
    setSponsorItems((prev) =>
      prev.map((item, idx) => {
        if (idx !== index) return item
        return { ...item, ...patch }
      })
    )
  }

  const removeSponsorItem = (index: number) => {
    setSponsorItems((prev) => reindexSponsorDrafts(prev.filter((_, idx) => idx !== index)))
  }

  const moveSponsorItem = (fromIndex: number, toIndex: number) => {
    setSponsorItems((prev) => moveSponsorDrafts(prev, fromIndex, toIndex))
  }

  const handleSponsorLogoUpload = async (index: number, file?: File | null) => {
    if (!file) return
    setSponsorUploadError({ index: null, message: '' })
    setSponsorUploadingIndex(index)
    try {
      const url = await uploadSponsorLogo(file)
      updateSponsorItem(index, { logo_url: url })
    } catch (err: unknown) {
      setSponsorUploadError({
        index,
        message: err instanceof Error ? err.message : 'Gagal upload logo sponsor.',
      })
    } finally {
      setSponsorUploadingIndex(null)
    }
  }

  const handleSponsorDragStart = (index: number) => (event: DragEvent<HTMLDivElement>) => {
    setDragSponsorIndex(index)
    setDragOverSponsorIndex(index)
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', String(index))
  }

  const handleSponsorDragOver = (index: number) => (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    if (dragOverSponsorIndex !== index) setDragOverSponsorIndex(index)
    event.dataTransfer.dropEffect = 'move'
  }

  const handleSponsorDrop = (index: number) => (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    const fallbackIndex = Number.parseInt(event.dataTransfer.getData('text/plain') || '', 10)
    const sourceIndex = dragSponsorIndex ?? fallbackIndex
    if (Number.isFinite(sourceIndex) && sourceIndex >= 0) {
      moveSponsorItem(sourceIndex, index)
    }
    setDragSponsorIndex(null)
    setDragOverSponsorIndex(null)
  }

  const resetSponsorDragState = () => {
    setDragSponsorIndex(null)
    setDragOverSponsorIndex(null)
  }

  const saveStaffAssignments = async () => {
    if (!eventId) return
    setStaffSaving(true)
    try {
      await apiFetch(`/api/events/${eventId}/staff-roles`, {
        method: 'PUT',
        body: JSON.stringify({
          assignments: staffAssignments
            .filter((item) => item.user_id && item.role)
            .map((item) => ({
              id: item.id,
              user_id: item.user_id,
              role: item.role,
              is_active: item.is_active,
              notes: item.notes ?? null,
            })),
        }),
      })
      await loadStaffAssignments()
      alert('Staff assignment tersimpan.')
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Gagal menyimpan staff assignment.')
    } finally {
      setStaffSaving(false)
    }
  }

  const handleSave = async () => {
    const dnsPoints = Number(form.scoring_dns_points)
    const dnfPoints =
      form.scoring_dnf_points.trim().toLowerCase() === 'last'
        ? 'last'
        : Number(form.scoring_dnf_points)
    const dqThreshold = Number(form.scoring_dq_threshold)

    if (!Number.isFinite(dnsPoints) || dnsPoints < 0) {
      alert('DNS points tidak valid.')
      return
    }
    if (dnfPoints !== 'last' && (!Number.isFinite(dnfPoints) || dnfPoints < 0)) {
      alert('DNF points tidak valid.')
      return
    }
    if (!Number.isFinite(dqThreshold) || dqThreshold < 0) {
      alert('DQ threshold tidak valid.')
      return
    }

    const scoring = {
      base_points_mode: form.scoring_base_mode,
      dns_points: dnsPoints,
      dnf_points: dnfPoints,
      dq_penalty_threshold: dqThreshold,
      tie_breaker: form.scoring_tie_breaker,
    }
    const theme = {
      primary_color: form.display_primary_color.trim() || '#2ecc71',
      secondary_color: form.display_secondary_color.trim() || '#111111',
      header_bg: form.display_header_bg.trim() || '#eaf7ee',
      card_bg: form.display_card_bg.trim() || '#ffffff',
      logo_url: form.display_logo_url.trim() || null,
      slogan: form.display_slogan.trim() || null,
    }
    const ownerType: NonNullable<BusinessSettings['event_owner_type']> =
      (form.business_event_owner_type || 'COMMUNITY') as NonNullable<BusinessSettings['event_owner_type']>
    const normalizedSponsors = sanitizeSponsorDrafts(sponsorItems)
    const existingBusinessSettings =
      row?.business_settings && typeof row.business_settings === 'object' && !Array.isArray(row.business_settings)
        ? (row.business_settings as BusinessSettings)
        : {}
    const businessSettings: BusinessSettings = {
      ...existingBusinessSettings,
      public_brand_name: form.business_public_brand_name.trim() || null,
      public_event_title: form.business_public_event_title.trim() || null,
      public_tagline: form.business_public_tagline.trim() || null,
      whatsapp_group_invite_url: form.business_whatsapp_group_invite_url.trim() || null,
      payment_bank_name: form.business_payment_bank_name.trim() || null,
      payment_account_name: form.business_payment_account_name.trim() || null,
      payment_account_number: form.business_payment_account_number.trim() || null,
      event_owner_name: form.business_event_owner_name.trim() || null,
      event_owner_type: ownerType,
      operating_committee_name: form.business_operating_committee_name.trim() || null,
      operating_committee_label: form.business_operating_committee_label.trim() || null,
      scoring_support_name: form.business_scoring_support_name.trim() || null,
      scoring_support_label: form.business_scoring_support_label.trim() || null,
      central_control_enabled: Boolean(form.business_central_control_enabled),
      requires_platform_approval: Boolean(form.business_requires_platform_approval),
      show_event_owner_publicly: Boolean(form.business_show_event_owner_publicly),
      show_operating_committee_publicly: Boolean(form.business_show_operating_committee_publicly),
      show_scoring_support_publicly: Boolean(form.business_show_scoring_support_publicly),
      sponsor_section_enabled: Boolean(sponsorSectionEnabled),
      sponsor_section_title: sponsorSectionTitle.trim() || null,
      sponsor_section_subtitle: sponsorSectionSubtitle.trim() || null,
      sponsors: normalizedSponsors,
    }
    const motoPerBatch = Number(form.race_moto_per_batch)
    const gatePositions = Number(form.race_gate_positions)
    if (!Number.isFinite(motoPerBatch) || motoPerBatch <= 0) {
      alert('Moto per batch tidak valid.')
      return
    }
    if (!Number.isFinite(gatePositions) || gatePositions <= 0) {
      alert('Gate positions tidak valid.')
      return
    }
    const existingFormat =
      row?.race_format_settings && typeof row.race_format_settings === 'object' && !Array.isArray(row.race_format_settings)
        ? (row.race_format_settings as Record<string, unknown>)
        : {}
    const format = {
      ...existingFormat,
      moto_per_batch: motoPerBatch,
      gate_positions: gatePositions,
      qualification_enabled: Boolean(form.race_qualification_enabled),
      auto_advance: Boolean(form.race_auto_advance),
      final_classes: form.race_final_classes
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean),
    }

    setSaving(true)
    try {
      const basePriceNum = Number(form.base_price)
      const extraPriceNum = Number(form.extra_price)
      const ffaMinNum = Number(form.ffa_mix_min_year)
      const ffaMaxNum = Number(form.ffa_mix_max_year)
      if (!Number.isFinite(basePriceNum) || basePriceNum <= 0) {
        alert('Base price tidak valid.')
        return
      }
      if (!Number.isFinite(extraPriceNum) || extraPriceNum < 0) {
        alert('Extra price tidak valid.')
        return
      }
      if (!Number.isFinite(ffaMinNum) || !Number.isFinite(ffaMaxNum)) {
        alert('FFA MIX range tidak valid.')
        return
      }
      if (ffaMinNum > ffaMaxNum) {
        alert('FFA MIX min year tidak boleh lebih besar dari max year.')
        return
      }
      await apiFetch(`/api/events/${eventId}/settings`, {
        method: 'PATCH',
        body: JSON.stringify({
          event_logo_url: form.event_logo_url.trim() || null,
          sponsor_logo_urls: normalizedSponsors
            .map((item) => item.logo_url?.trim())
            .filter((item): item is string => Boolean(item)),
          base_price: basePriceNum,
          extra_price: extraPriceNum,
          ffa_mix_min_year: ffaMinNum,
          ffa_mix_max_year: ffaMaxNum,
          require_jersey_size: Boolean(form.require_jersey_size),
          scoring_rules: scoring,
          display_theme: theme,
          business_settings: businessSettings,
          race_format_settings: format,
        }),
      })
      await load()
      setInitialForm(JSON.stringify({
        ...form,
        sponsorSectionEnabled,
        sponsorSectionTitle,
        sponsorSectionSubtitle,
        sponsorItems,
      }))
      alert('Settings tersimpan.')
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Gagal menyimpan settings.')
    } finally {
      setSaving(false)
    }
  }

  const previewSponsors = useMemo(() => sanitizeSponsorDrafts(sponsorItems), [sponsorItems])
  const previewBusinessSettings = useMemo<BusinessSettings>(
    () => ({
      sponsor_section_enabled: sponsorSectionEnabled,
      sponsor_section_title: sponsorSectionTitle.trim() || null,
      sponsor_section_subtitle: sponsorSectionSubtitle.trim() || null,
      sponsors: previewSponsors,
    }),
    [previewSponsors, sponsorSectionEnabled, sponsorSectionTitle, sponsorSectionSubtitle]
  )
  const isDirty =
    initialForm !==
    JSON.stringify({
      ...form,
      sponsorSectionEnabled,
      sponsorSectionTitle,
      sponsorSectionSubtitle,
      sponsorItems,
    })
  const basicSummary = `Base ${Number(form.base_price || 0).toLocaleString()} | Extra ${Number(
    form.extra_price || 0
  ).toLocaleString()} | Sponsor ${previewSponsors.length} | Jersey ${form.require_jersey_size ? 'Wajib' : 'Opsional'}`
  const businessSummary = `Brand ${form.business_public_brand_name || 'Belum diisi'} | Rekening ${
    form.business_payment_account_number || 'Belum diisi'
  } | Scoring Support ${form.business_scoring_support_name || 'Belum diisi'}`
  const appearanceSummary = 'Logo event + race format'
  const advancedSummary = `${advancedItems.filter((i) => i.config?.enabled).length} enabled`
  const filteredAvailableUsers = useMemo(() => {
    const keyword = staffSearch.trim().toLowerCase()
    if (!keyword) return availableUsers
    return availableUsers.filter((user) => {
      const email = String(user.email ?? '').toLowerCase()
      const role = formatAppRoleLabel(user.global_role).toLowerCase()
      return email.includes(keyword) || role.includes(keyword)
    })
  }, [availableUsers, staffSearch])

  return (
    <div style={{ maxWidth: 980 }}>
      <h1 style={{ fontSize: 26, fontWeight: 950, margin: 0 }}>Event Settings</h1>
      <div style={{ marginTop: 8, color: '#333', fontWeight: 700 }}>
        Logo/sponsor & konfigurasi display/scoring per event.
      </div>

      <div
        style={{
          marginTop: 16,
          display: 'grid',
          gap: 10,
        }}
      >
        {[
          { key: 'basic', label: 'Basic' },
          { key: 'business', label: 'Business & Roles' },
          { key: 'appearance', label: 'Display & Race Format' },
          { key: 'advanced', label: 'Advanced Multi-Stage' },
        ].map((section) => {
          const isOpen = sections[section.key as keyof typeof sections]
          const summary =
            section.key === 'basic'
              ? basicSummary
              : section.key === 'business'
              ? businessSummary
              : section.key === 'appearance'
              ? appearanceSummary
              : advancedSummary
          return (
            <button
              key={section.key}
              type="button"
              onClick={() => setSections((prev) => ({ ...prev, [section.key]: !prev[section.key as keyof typeof prev] }))}
              style={{
                padding: '10px 14px',
                borderRadius: 12,
                border: '2px solid #111',
                background: isOpen ? '#bfead2' : '#fff',
                fontWeight: 900,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer',
              }}
            >
              <span style={{ display: 'grid', gap: 2, textAlign: 'left' }}>
                <span>{section.label}</span>
                <span style={{ fontSize: 11, fontWeight: 800, color: '#333' }}>{summary}</span>
              </span>
              <span style={{ fontSize: 12 }}>{isOpen ? 'Hide' : 'Show'}</span>
            </button>
          )
        })}
      </div>

      <div
        style={{
          marginTop: 16,
          background: '#fff',
          border: '2px solid #111',
          borderRadius: 16,
          padding: 16,
          display: 'grid',
          gap: 10,
        }}
      >
        {loading && (
          <div style={{ padding: 14, borderRadius: 16, border: '2px dashed #111', background: '#fff', fontWeight: 900 }}>
            Loading...
          </div>
        )}

        {!loading && (
          <>
            {sections.basic && (
              <>
                <div style={{ fontWeight: 950, fontSize: 18 }}>Basic</div>
                <input
                  placeholder="Event Logo URL (optional)"
                  value={form.event_logo_url}
                  onChange={(e) => setForm({ ...form, event_logo_url: e.target.value })}
                  style={{ padding: 12, borderRadius: 12, border: '2px solid #111', fontWeight: 800 }}
                />
                <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  Sponsor Manager
                </div>
                <div style={{ color: '#475569', fontWeight: 700, fontSize: 13 }}>
                  Kelola sponsor per item untuk event page dan live display. Logo URL tetap akan disimpan juga
                  sebagai fallback cepat.
                </div>
                <div style={{ display: 'grid', gap: 10 }}>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                    <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 800 }}>
                      <input
                        type="checkbox"
                        checked={sponsorSectionEnabled}
                        onChange={(e) => setSponsorSectionEnabled(e.target.checked)}
                      />
                      Tampilkan sponsor section
                    </label>
                    <button
                      type="button"
                      onClick={addSponsorItem}
                      style={{
                        padding: '8px 12px',
                        borderRadius: 10,
                        border: '2px solid #111',
                        background: '#bfead2',
                        fontWeight: 900,
                        cursor: 'pointer',
                      }}
                    >
                      Add Sponsor
                    </button>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <input
                      value={sponsorSectionTitle}
                      onChange={(e) => setSponsorSectionTitle(e.target.value)}
                      placeholder="Section title"
                      style={{ padding: 12, borderRadius: 12, border: '2px solid #111', fontWeight: 800 }}
                    />
                    <input
                      value={sponsorSectionSubtitle}
                      onChange={(e) => setSponsorSectionSubtitle(e.target.value)}
                      placeholder="Section subtitle"
                      style={{ padding: 12, borderRadius: 12, border: '2px solid #111', fontWeight: 800 }}
                    />
                  </div>

                  {sponsorItems.length === 0 ? (
                    <div
                      style={{
                        padding: 12,
                        borderRadius: 12,
                        border: '2px dashed #111',
                        background: '#f8fafc',
                        fontWeight: 800,
                        color: '#475569',
                      }}
                    >
                      Belum ada sponsor. Klik <strong>Add Sponsor</strong> untuk mulai.
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gap: 12 }}>
                      {sponsorItems.map((item, index) => (
                        <div
                          key={`sponsor-${index}`}
                          onDragOver={handleSponsorDragOver(index)}
                          onDrop={handleSponsorDrop(index)}
                          style={{
                            padding: 12,
                            borderRadius: 14,
                            border:
                              dragOverSponsorIndex === index && dragSponsorIndex !== index
                                ? '2px solid #2563eb'
                                : '2px solid #111',
                            background: dragSponsorIndex === index ? '#eef2ff' : '#f8fafc',
                            display: 'grid',
                            gap: 10,
                            boxShadow:
                              dragOverSponsorIndex === index && dragSponsorIndex !== index
                                ? '0 0 0 3px rgba(37,99,235,0.12)'
                                : 'none',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                              <span
                                draggable={sponsorItems.length > 1}
                                onDragStart={handleSponsorDragStart(index)}
                                onDragEnd={resetSponsorDragState}
                                style={{
                                  padding: '6px 10px',
                                  borderRadius: 999,
                                  border: '2px solid #111',
                                  background: '#fff',
                                  fontWeight: 900,
                                  cursor: sponsorItems.length > 1 ? 'grab' : 'default',
                                  userSelect: 'none',
                                }}
                                title="Drag untuk ubah urutan sponsor"
                              >
                                Drag
                              </span>
                              <div style={{ fontWeight: 900 }}>Sponsor #{index + 1}</div>
                              <span
                                style={{
                                  padding: '4px 8px',
                                  borderRadius: 999,
                                  background: '#dbeafe',
                                  border: '1px solid #93c5fd',
                                  color: '#1d4ed8',
                                  fontSize: 12,
                                  fontWeight: 900,
                                }}
                              >
                                Urutan {index + 1}
                              </span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                              <button
                                type="button"
                                onClick={() => moveSponsorItem(index, index - 1)}
                                disabled={index === 0}
                                style={{
                                  padding: '6px 10px',
                                  borderRadius: 10,
                                  border: '2px solid #111',
                                  background: index === 0 ? '#e5e7eb' : '#fff',
                                  fontWeight: 900,
                                  cursor: index === 0 ? 'not-allowed' : 'pointer',
                                  opacity: index === 0 ? 0.6 : 1,
                                }}
                              >
                                Up
                              </button>
                              <button
                                type="button"
                                onClick={() => moveSponsorItem(index, index + 1)}
                                disabled={index === sponsorItems.length - 1}
                                style={{
                                  padding: '6px 10px',
                                  borderRadius: 10,
                                  border: '2px solid #111',
                                  background: index === sponsorItems.length - 1 ? '#e5e7eb' : '#fff',
                                  fontWeight: 900,
                                  cursor: index === sponsorItems.length - 1 ? 'not-allowed' : 'pointer',
                                  opacity: index === sponsorItems.length - 1 ? 0.6 : 1,
                                }}
                              >
                                Down
                              </button>
                              <button
                                type="button"
                                onClick={() => removeSponsorItem(index)}
                                style={{
                                  padding: '6px 10px',
                                  borderRadius: 10,
                                  border: '2px solid #b91c1c',
                                  background: '#fee2e2',
                                  color: '#7f1d1d',
                                  fontWeight: 900,
                                  cursor: 'pointer',
                                }}
                              >
                                Remove
                              </button>
                            </div>
                          </div>

                          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 10 }}>
                            <input
                              value={item.name}
                              onChange={(e) => updateSponsorItem(index, { name: e.target.value })}
                              placeholder="Sponsor name"
                              style={{ padding: 12, borderRadius: 12, border: '2px solid #111', fontWeight: 800 }}
                            />
                            <select
                              value={item.tier}
                              onChange={(e) => updateSponsorItem(index, { tier: e.target.value as EventSponsorTier })}
                              style={{ padding: 12, borderRadius: 12, border: '2px solid #111', fontWeight: 800 }}
                            >
                              {sponsorTierOptions.map((tier) => (
                                <option key={tier} value={tier}>
                                  {tier}
                                </option>
                              ))}
                            </select>
                          </div>

                          <input
                            value={item.logo_url}
                            onChange={(e) => updateSponsorItem(index, { logo_url: e.target.value })}
                            placeholder="Logo URL"
                            style={{ padding: 12, borderRadius: 12, border: '2px solid #111', fontWeight: 800 }}
                          />

                          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                            <label
                              style={{
                                padding: '8px 12px',
                                borderRadius: 10,
                                border: '2px solid #111',
                                background: '#fff',
                                fontWeight: 900,
                                cursor: sponsorUploadingIndex === index ? 'progress' : 'pointer',
                              }}
                            >
                              {sponsorUploadingIndex === index ? 'Uploading...' : 'Upload Logo'}
                              <input
                                type="file"
                                accept="image/*"
                                disabled={sponsorUploadingIndex !== null}
                                onChange={async (e) => {
                                  const file = e.currentTarget.files?.[0]
                                  await handleSponsorLogoUpload(index, file)
                                  e.currentTarget.value = ''
                                }}
                                style={{ display: 'none' }}
                              />
                            </label>
                            <div style={{ fontSize: 12, color: '#475569', fontWeight: 700 }}>
                              Upload langsung atau tetap paste URL kalau logo sudah ada di hosting.
                            </div>
                          </div>
                          {sponsorUploadError.index === index && sponsorUploadError.message && (
                            <div style={{ fontSize: 12, fontWeight: 800, color: '#b91c1c' }}>
                              {sponsorUploadError.message}
                            </div>
                          )}

                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                            <input
                              value={item.website_url}
                              onChange={(e) => updateSponsorItem(index, { website_url: e.target.value })}
                              placeholder="Website URL (opsional)"
                              style={{ padding: 12, borderRadius: 12, border: '2px solid #111', fontWeight: 800 }}
                            />
                            <input
                              value={item.instagram_url}
                              onChange={(e) => updateSponsorItem(index, { instagram_url: e.target.value })}
                              placeholder="Instagram URL (opsional)"
                              style={{ padding: 12, borderRadius: 12, border: '2px solid #111', fontWeight: 800 }}
                            />
                          </div>

                          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 800 }}>
                              <input
                                type="checkbox"
                                checked={item.is_active}
                                onChange={(e) => updateSponsorItem(index, { is_active: e.target.checked })}
                              />
                              Active
                            </label>
                            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 800 }}>
                              <input
                                type="checkbox"
                                checked={item.show_on_event_page}
                                onChange={(e) => updateSponsorItem(index, { show_on_event_page: e.target.checked })}
                              />
                              Event Page
                            </label>
                            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 800 }}>
                              <input
                                type="checkbox"
                                checked={item.show_on_live_display}
                                onChange={(e) => updateSponsorItem(index, { show_on_live_display: e.target.checked })}
                              />
                              Live Display
                            </label>
                          </div>

                          {item.logo_url.trim() && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <img
                                src={item.logo_url}
                                alt={item.name || `Sponsor ${index + 1}`}
                                style={{ height: 48, width: 'auto', maxWidth: 160, objectFit: 'contain', borderRadius: 8, background: '#fff', border: '1px solid #cbd5e1', padding: 6 }}
                              />
                              <div style={{ fontSize: 12, color: '#475569', fontWeight: 700 }}>
                                Preview logo sponsor
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  <div style={{ display: 'grid', gap: 10 }}>
                    <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                      Preview Sebelum Save
                    </div>
                    <div style={{ color: '#475569', fontWeight: 700, fontSize: 13 }}>
                      Preview ini meniru sponsor marquee di event page dan live display.
                    </div>
                    <SponsorMarquee
                      businessSettings={previewBusinessSettings}
                      sponsorLogoUrls={previewSponsors.map((item) => item.logo_url ?? '').filter(Boolean)}
                      placement="event_page"
                      title={sponsorSectionTitle || 'Official Sponsors'}
                      subtitle={sponsorSectionSubtitle || 'Partner dan sponsor yang ikut mendukung event ini.'}
                    />
                    <SponsorMarquee
                      businessSettings={previewBusinessSettings}
                      sponsorLogoUrls={previewSponsors.map((item) => item.logo_url ?? '').filter(Boolean)}
                      placement="live_display"
                      title="Supported By"
                      subtitle="Preview ribbon sponsor untuk live display."
                      compact
                    />
                  </div>
                </div>
                <div style={{ display: 'grid', gap: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                    Biaya Pendaftaran
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <input
                      type="number"
                      min={0}
                      placeholder="Base Price"
                      value={form.base_price}
                      onChange={(e) => setForm({ ...form, base_price: e.target.value })}
                      style={{ padding: 12, borderRadius: 12, border: '2px solid #111', fontWeight: 800 }}
                    />
                    <input
                      type="number"
                      min={0}
                      placeholder="Extra Price"
                      value={form.extra_price}
                      onChange={(e) => setForm({ ...form, extra_price: e.target.value })}
                      style={{ padding: 12, borderRadius: 12, border: '2px solid #111', fontWeight: 800 }}
                    />
                  </div>
                  <div style={{ fontSize: 12, color: '#333', fontWeight: 700 }}>
                    Base = biaya per rider. Extra = biaya tambahan kategori ekstra.
                  </div>
                </div>
                <div style={{ display: 'grid', gap: 8, marginTop: 6 }}>
                  <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                    FFA MIX Range
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <input
                      type="number"
                      placeholder="FFA Min Year"
                      value={form.ffa_mix_min_year}
                      onChange={(e) => setForm({ ...form, ffa_mix_min_year: e.target.value })}
                      style={{ padding: 12, borderRadius: 12, border: '2px solid #111', fontWeight: 800 }}
                    />
                    <input
                      type="number"
                      placeholder="FFA Max Year"
                      value={form.ffa_mix_max_year}
                      onChange={(e) => setForm({ ...form, ffa_mix_max_year: e.target.value })}
                      style={{ padding: 12, borderRadius: 12, border: '2px solid #111', fontWeight: 800 }}
                    />
                  </div>
                  <div style={{ fontSize: 12, color: '#333', fontWeight: 700 }}>
                    Rider dalam rentang ini akan masuk kategori FFA-MIX.
                  </div>
                </div>
                <div style={{ display: 'grid', gap: 8, marginTop: 6 }}>
                  <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                    Jersey
                  </div>
                  <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 800 }}>
                    <input
                      type="checkbox"
                      checked={form.require_jersey_size}
                      onChange={(e) => setForm({ ...form, require_jersey_size: e.target.checked })}
                    />
                    Wajib isi ukuran jersey per rider
                  </label>
                  <div style={{ fontSize: 12, color: '#333', fontWeight: 700 }}>
                    Jika aktif, pendaftar harus memilih ukuran jersey (XS–XL).
                  </div>
                </div>
                <div style={{ display: 'grid', gap: 8, marginTop: 6 }}>
                  <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                    Scoring Rules
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <select
                      value={form.scoring_base_mode}
                      onChange={(e) => setForm({ ...form, scoring_base_mode: e.target.value })}
                      style={{ padding: 12, borderRadius: 12, border: '2px solid #111', fontWeight: 800 }}
                    >
                      <option value="finish_order">finish_order</option>
                    </select>
                    <select
                      value={form.scoring_tie_breaker}
                      onChange={(e) => setForm({ ...form, scoring_tie_breaker: e.target.value })}
                      style={{ padding: 12, borderRadius: 12, border: '2px solid #111', fontWeight: 800 }}
                    >
                      <option value="last_best">last_best</option>
                    </select>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                    <input
                      type="number"
                      min={0}
                      placeholder="DNS points"
                      value={form.scoring_dns_points}
                      onChange={(e) => setForm({ ...form, scoring_dns_points: e.target.value })}
                      style={{ padding: 12, borderRadius: 12, border: '2px solid #111', fontWeight: 800 }}
                    />
                    <input
                      placeholder="DNF points (number or 'last')"
                      value={form.scoring_dnf_points}
                      onChange={(e) => setForm({ ...form, scoring_dnf_points: e.target.value })}
                      style={{ padding: 12, borderRadius: 12, border: '2px solid #111', fontWeight: 800 }}
                    />
                    <input
                      type="number"
                      min={0}
                      placeholder="DQ threshold"
                      value={form.scoring_dq_threshold}
                      onChange={(e) => setForm({ ...form, scoring_dq_threshold: e.target.value })}
                      style={{ padding: 12, borderRadius: 12, border: '2px solid #111', fontWeight: 800 }}
                    />
                  </div>
                  <div style={{ fontSize: 12, color: '#333', fontWeight: 700 }}>
                    Scoring rules disimpan otomatis ke JSON scoring_rules saat Save.
                  </div>
                </div>
              </>
            )}

            {sections.business && (
              <>
                <div style={{ marginTop: 6, fontWeight: 950, fontSize: 18 }}>Business & Roles</div>
                <div style={{ fontSize: 12, color: '#333', fontWeight: 700 }}>
                  Atur brand publik event, Event Owner, Operating Committee, dan Scoring Support.
                </div>
                <div
                  style={{
                    marginTop: 8,
                    border: '2px solid #111',
                    borderRadius: 18,
                    padding: 16,
                    background: 'linear-gradient(135deg,#0f172a 0%,#1e293b 48%,#78350f 100%)',
                    color: '#fff',
                    display: 'grid',
                    gap: 10,
                    boxShadow: '0 18px 40px rgba(15,23,42,0.22)',
                  }}
                >
                  <div style={{ display: 'grid', gap: 4 }}>
                    <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#fcd34d' }}>
                      Public Preview
                    </div>
                    <div style={{ fontSize: 28, fontWeight: 950, lineHeight: 1.05 }}>
                      {form.business_public_event_title || form.business_public_brand_name || 'Event Title'}
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: '#fde68a' }}>
                      {form.business_public_brand_name || 'Public Brand Name'}
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#cbd5e1' }}>
                      {form.business_public_tagline || 'Tagline event akan tampil di halaman publik bila diisi.'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {form.business_show_event_owner_publicly && form.business_event_owner_name && (
                      <span style={{ borderRadius: 999, border: '1px solid rgba(255,255,255,0.18)', background: 'rgba(255,255,255,0.08)', padding: '6px 12px', fontSize: 12, fontWeight: 900 }}>
                        Event Owner: {form.business_event_owner_name}
                      </span>
                    )}
                    {form.business_show_operating_committee_publicly &&
                      (form.business_operating_committee_label || form.business_operating_committee_name) && (
                        <span style={{ borderRadius: 999, border: '1px solid rgba(255,255,255,0.18)', background: 'rgba(255,255,255,0.08)', padding: '6px 12px', fontSize: 12, fontWeight: 900 }}>
                          Operating Committee: {form.business_operating_committee_label || form.business_operating_committee_name}
                        </span>
                      )}
                    {form.business_show_scoring_support_publicly &&
                      (form.business_scoring_support_label || form.business_scoring_support_name) && (
                        <span style={{ borderRadius: 999, border: '1px solid rgba(255,255,255,0.18)', background: 'rgba(255,255,255,0.08)', padding: '6px 12px', fontSize: 12, fontWeight: 900 }}>
                          Scoring Support: {form.business_scoring_support_label || form.business_scoring_support_name}
                        </span>
                      )}
                    <span style={{ borderRadius: 999, border: '1px solid rgba(251,191,36,0.4)', background: 'rgba(251,191,36,0.16)', padding: '6px 12px', fontSize: 12, fontWeight: 900, color: '#fde68a' }}>
                      Central Control: {form.business_central_control_enabled ? 'Active' : 'Off'}
                    </span>
                  </div>
                </div>
                <div style={{ display: 'grid', gap: 8, marginTop: 6 }}>
                  <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                    Public Branding
                  </div>
                  <input
                    placeholder="Public Brand Name"
                    value={form.business_public_brand_name}
                    onChange={(e) => setForm({ ...form, business_public_brand_name: e.target.value })}
                    style={{ padding: 12, borderRadius: 12, border: '2px solid #111', fontWeight: 800 }}
                  />
                  <input
                    placeholder="Public Event Title"
                    value={form.business_public_event_title}
                    onChange={(e) => setForm({ ...form, business_public_event_title: e.target.value })}
                    style={{ padding: 12, borderRadius: 12, border: '2px solid #111', fontWeight: 800 }}
                  />
                  <input
                    placeholder="Public Tagline"
                    value={form.business_public_tagline}
                    onChange={(e) => setForm({ ...form, business_public_tagline: e.target.value })}
                    style={{ padding: 12, borderRadius: 12, border: '2px solid #111', fontWeight: 800 }}
                  />
                  <input
                    placeholder="Link Grup WhatsApp (contoh: https://chat.whatsapp.com/...)"
                    value={form.business_whatsapp_group_invite_url}
                    onChange={(e) => setForm({ ...form, business_whatsapp_group_invite_url: e.target.value })}
                    style={{ padding: 12, borderRadius: 12, border: '2px solid #111', fontWeight: 800 }}
                  />
                  <div style={{ fontSize: 12, color: '#333', fontWeight: 700 }}>
                    Jika diisi, tombol masuk grup WhatsApp akan muncul setelah pendaftaran berhasil dikirim.
                  </div>
                </div>
                <div style={{ display: 'grid', gap: 8, marginTop: 6 }}>
                  <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                    Payment Transfer
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                    <input
                      placeholder="Bank Tujuan Transfer"
                      value={form.business_payment_bank_name}
                      onChange={(e) => setForm({ ...form, business_payment_bank_name: e.target.value })}
                      style={{ padding: 12, borderRadius: 12, border: '2px solid #111', fontWeight: 800 }}
                    />
                    <input
                      placeholder="Atas Nama Rekening"
                      value={form.business_payment_account_name}
                      onChange={(e) => setForm({ ...form, business_payment_account_name: e.target.value })}
                      style={{ padding: 12, borderRadius: 12, border: '2px solid #111', fontWeight: 800 }}
                    />
                    <input
                      placeholder="Nomor Rekening Tujuan"
                      value={form.business_payment_account_number}
                      onChange={(e) => setForm({ ...form, business_payment_account_number: e.target.value })}
                      style={{ padding: 12, borderRadius: 12, border: '2px solid #111', fontWeight: 800 }}
                    />
                  </div>
                  <div style={{ fontSize: 12, color: '#333', fontWeight: 700 }}>
                    Data ini akan tampil di halaman pendaftaran sebagai rekening tujuan transfer.
                  </div>
                </div>
                <div style={{ display: 'grid', gap: 8, marginTop: 6 }}>
                  <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                    Event Owner
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 10 }}>
                    <input
                      placeholder="Event Owner Name"
                      value={form.business_event_owner_name}
                      onChange={(e) => setForm({ ...form, business_event_owner_name: e.target.value })}
                      style={{ padding: 12, borderRadius: 12, border: '2px solid #111', fontWeight: 800 }}
                    />
                    <select
                      value={form.business_event_owner_type}
                      onChange={(e) => setForm({ ...form, business_event_owner_type: e.target.value })}
                      style={{ padding: 12, borderRadius: 12, border: '2px solid #111', fontWeight: 800 }}
                    >
                      <option value="COMMUNITY">COMMUNITY</option>
                      <option value="EO">EO</option>
                      <option value="CLUB">CLUB</option>
                      <option value="INTERNAL">INTERNAL</option>
                      <option value="OTHER">OTHER</option>
                    </select>
                  </div>
                  <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 800 }}>
                    <input
                      type="checkbox"
                      checked={form.business_show_event_owner_publicly}
                      onChange={(e) => setForm({ ...form, business_show_event_owner_publicly: e.target.checked })}
                    />
                    Tampilkan event owner di halaman publik
                  </label>
                </div>
                <div style={{ display: 'grid', gap: 8, marginTop: 6 }}>
                  <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                    Operating Committee
                  </div>
                  <input
                    placeholder="Operating Committee Name"
                    value={form.business_operating_committee_name}
                    onChange={(e) => setForm({ ...form, business_operating_committee_name: e.target.value })}
                    style={{ padding: 12, borderRadius: 12, border: '2px solid #111', fontWeight: 800 }}
                  />
                  <input
                    placeholder="Operating Committee Label"
                    value={form.business_operating_committee_label}
                    onChange={(e) => setForm({ ...form, business_operating_committee_label: e.target.value })}
                    style={{ padding: 12, borderRadius: 12, border: '2px solid #111', fontWeight: 800 }}
                  />
                  <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 800 }}>
                    <input
                      type="checkbox"
                      checked={form.business_show_operating_committee_publicly}
                      onChange={(e) =>
                        setForm({ ...form, business_show_operating_committee_publicly: e.target.checked })
                      }
                    />
                    Tampilkan operating committee di halaman publik
                  </label>
                </div>
                <div style={{ display: 'grid', gap: 8, marginTop: 6 }}>
                  <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                    Scoring Support
                  </div>
                  <input
                    placeholder="Scoring Support Name"
                    value={form.business_scoring_support_name}
                    onChange={(e) => setForm({ ...form, business_scoring_support_name: e.target.value })}
                    style={{ padding: 12, borderRadius: 12, border: '2px solid #111', fontWeight: 800 }}
                  />
                  <input
                    placeholder="Scoring Support Label"
                    value={form.business_scoring_support_label}
                    onChange={(e) => setForm({ ...form, business_scoring_support_label: e.target.value })}
                    style={{ padding: 12, borderRadius: 12, border: '2px solid #111', fontWeight: 800 }}
                  />
                  <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 800 }}>
                    <input
                      type="checkbox"
                      checked={form.business_show_scoring_support_publicly}
                      onChange={(e) => setForm({ ...form, business_show_scoring_support_publicly: e.target.checked })}
                    />
                    Tampilkan scoring support di halaman publik
                  </label>
                </div>
                <div style={{ display: 'grid', gap: 8, marginTop: 6 }}>
                  <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                    Central Control
                  </div>
                  <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 800 }}>
                    <input
                      type="checkbox"
                      checked={form.business_central_control_enabled}
                      onChange={(e) => setForm({ ...form, business_central_control_enabled: e.target.checked })}
                    />
                    Central control / kamar hitung aktif
                  </label>
                  <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 800 }}>
                    <input
                      type="checkbox"
                      checked={form.business_requires_platform_approval}
                      onChange={(e) => setForm({ ...form, business_requires_platform_approval: e.target.checked })}
                    />
                    Perlu approval platform untuk keputusan tertentu
                  </label>
                </div>
                <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                    Event Staff Assignments
                  </div>
                  <div style={{ fontSize: 12, color: '#333', fontWeight: 700 }}>
                    Assign user ke event ini dengan role per-event. Ini akan menjadi dasar transisi dari role global ke role scoped per event.
                  </div>
                  <div style={{ display: 'grid', gap: 8 }}>
                    <input
                      value={staffSearch}
                      onChange={(e) => setStaffSearch(e.target.value)}
                      placeholder="Cari user by email atau global role"
                      style={{ padding: 12, borderRadius: 12, border: '2px solid #111', fontWeight: 800 }}
                    />
                    <div style={{ fontSize: 12, color: '#333', fontWeight: 700 }}>
                      {filteredAvailableUsers.length} user cocok dari {availableUsers.length} total user assignable.
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={addStaffAssignment}
                      style={{
                        padding: '10px 12px',
                        borderRadius: 12,
                        border: '2px solid #111',
                        background: '#fff',
                        fontWeight: 900,
                        cursor: 'pointer',
                      }}
                    >
                      Add Assignment
                    </button>
                    <button
                      type="button"
                      onClick={saveStaffAssignments}
                      disabled={staffSaving}
                      style={{
                        padding: '10px 12px',
                        borderRadius: 12,
                        border: '2px solid #111',
                        background: '#bfead2',
                        fontWeight: 900,
                        cursor: 'pointer',
                      }}
                    >
                      {staffSaving ? 'Saving...' : 'Save Assignments'}
                    </button>
                  </div>
                  {staffLoading && (
                    <div style={{ padding: 12, borderRadius: 12, border: '2px dashed #111', fontWeight: 800 }}>
                      Loading staff assignments...
                    </div>
                  )}
                  {!staffLoading && staffAssignments.length === 0 && (
                    <div style={{ padding: 12, borderRadius: 12, border: '2px dashed #111', fontWeight: 800 }}>
                      Belum ada assignment per-event. Klik Add Assignment untuk mulai.
                    </div>
                  )}
                  {!staffLoading &&
                    staffAssignments.map((assignment, index) => (
                      <div
                        key={assignment.id ?? `assignment-${index}`}
                        style={{
                          border: '2px solid #111',
                          borderRadius: 14,
                          padding: 12,
                          display: 'grid',
                          gap: 10,
                          background: '#fff',
                        }}
                      >
                        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr auto', gap: 10 }}>
                          <select
                            value={assignment.user_id}
                            onChange={(e) => updateStaffAssignment(index, { user_id: e.target.value })}
                            style={{ padding: 12, borderRadius: 12, border: '2px solid #111', fontWeight: 800 }}
                          >
                            <option value="">Pilih User</option>
                            {filteredAvailableUsers.map((user) => (
                              <option key={user.id} value={user.id}>
                                {user.email ?? user.id} [{formatAppRoleLabel(user.global_role) || 'No Role'}]
                              </option>
                            ))}
                          </select>
                          <select
                            value={assignment.role}
                            onChange={(e) => updateStaffAssignment(index, { role: e.target.value })}
                            style={{ padding: 12, borderRadius: 12, border: '2px solid #111', fontWeight: 800 }}
                          >
                            <option value="SUPER_ADMIN">{formatAppRoleLabel('SUPER_ADMIN')}</option>
                            <option value="ADMIN">{formatAppRoleLabel('ADMIN')}</option>
                            <option value="CHECKER">{formatAppRoleLabel('CHECKER')}</option>
                            <option value="FINISHER">{formatAppRoleLabel('FINISHER')}</option>
                            <option value="RACE_DIRECTOR">{formatAppRoleLabel('RACE_DIRECTOR')}</option>
                            <option value="RACE_CONTROL">{formatAppRoleLabel('RACE_CONTROL')}</option>
                            <option value="MC">{formatAppRoleLabel('MC')}</option>
                          </select>
                          <button
                            type="button"
                            onClick={() => removeStaffAssignment(index)}
                            style={{
                              padding: '10px 12px',
                              borderRadius: 12,
                              border: '2px solid #b91c1c',
                              background: '#fee2e2',
                              color: '#b91c1c',
                              fontWeight: 900,
                              cursor: 'pointer',
                            }}
                          >
                            Remove
                          </button>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, alignItems: 'center' }}>
                          <input
                            value={assignment.notes ?? ''}
                            onChange={(e) => updateStaffAssignment(index, { notes: e.target.value })}
                            placeholder="Notes (optional)"
                            style={{ padding: 12, borderRadius: 12, border: '2px solid #111', fontWeight: 800 }}
                          />
                          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 800 }}>
                            <input
                              type="checkbox"
                              checked={assignment.is_active}
                              onChange={(e) => updateStaffAssignment(index, { is_active: e.target.checked })}
                            />
                            Active
                          </label>
                        </div>
                        <div style={{ fontSize: 12, color: '#333', fontWeight: 700 }}>
                          Global role: {assignment.global_role ? formatAppRoleLabel(assignment.global_role) : '-'}{' '}
                          {assignment.email ? `| ${assignment.email}` : ''}
                        </div>
                      </div>
                    ))}
                </div>
              </>
            )}

            {sections.appearance && (
              <>
                <div style={{ marginTop: 6, fontWeight: 950, fontSize: 18 }}>Display & Race Format</div>
                <div style={{ marginTop: 10, fontWeight: 900 }}>Event Logo</div>
                <div style={{ color: '#475569', fontWeight: 700, fontSize: 13 }}>
                  Pakai logo event untuk branding halaman publik, display, dan hasil.
                </div>
                <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
                  <input
                    value={form.display_logo_url}
                    onChange={(e) => setForm({ ...form, display_logo_url: e.target.value })}
                    placeholder="Logo URL (opsional, akan terisi otomatis jika upload logo)"
                    style={{ padding: 12, borderRadius: 12, border: '2px solid #111', fontWeight: 800 }}
                  />
                </div>
                <div style={{ display: 'grid', gap: 8 }}>
                  <div style={{ fontWeight: 900 }}>Upload Logo</div>
                  <input
                    type="file"
                    accept="image/*"
                    disabled={logoUploading}
                    onChange={async (e) => {
                      const file = e.target.files?.[0]
                      if (!file) return
                      setLogoError('')
                      setLogoUploading(true)
                      try {
                        const url = await uploadLogo(file)
                        setForm((prev) => ({
                          ...prev,
                          event_logo_url: url,
                          display_logo_url: url,
                        }))
                      } catch (err: unknown) {
                        setLogoError(err instanceof Error ? err.message : 'Gagal upload logo.')
                      } finally {
                        setLogoUploading(false)
                      }
                    }}
                    style={{ padding: 8, borderRadius: 10, border: '2px solid #111', fontWeight: 800 }}
                  />
                  {logoUploading && <div style={{ fontWeight: 800 }}>Uploading...</div>}
                  {logoError && <div style={{ fontWeight: 800, color: '#b91c1c' }}>{logoError}</div>}
                  {form.event_logo_url && (
                    <img
                      src={form.event_logo_url}
                      alt="Event logo preview"
                      style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 12, border: '2px solid #111' }}
                    />
                  )}
                </div>
                <input
                  value={form.display_slogan}
                  onChange={(e) => setForm({ ...form, display_slogan: e.target.value })}
                  placeholder="Event slogan (opsional)"
                  style={{ padding: 12, borderRadius: 12, border: '2px solid #111', fontWeight: 800 }}
                />

                <div style={{ marginTop: 14, fontWeight: 900 }}>Race Format</div>
                <div style={{ color: '#475569', fontWeight: 700, fontSize: 13 }}>
                  Atur jumlah moto, gate, dan auto-advance untuk format balap event ini.
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <input
                    type="number"
                    min={1}
                    value={form.race_moto_per_batch}
                    onChange={(e) => setForm({ ...form, race_moto_per_batch: e.target.value })}
                    placeholder="Moto per batch"
                    style={{ padding: 12, borderRadius: 12, border: '2px solid #111', fontWeight: 800 }}
                  />
                  <input
                    type="number"
                    min={1}
                    value={form.race_gate_positions}
                    onChange={(e) => setForm({ ...form, race_gate_positions: e.target.value })}
                    placeholder="Gate positions"
                    style={{ padding: 12, borderRadius: 12, border: '2px solid #111', fontWeight: 800 }}
                  />
                </div>
                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                  <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 800 }}>
                    <input
                      type="checkbox"
                      checked={form.race_qualification_enabled}
                      onChange={(e) => setForm({ ...form, race_qualification_enabled: e.target.checked })}
                    />
                    Qualification enabled
                  </label>
                  <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 800 }}>
                    <input
                      type="checkbox"
                      checked={form.race_auto_advance}
                      onChange={(e) => setForm({ ...form, race_auto_advance: e.target.checked })}
                    />
                    Auto advance
                  </label>
                </div>
                <input
                  value={form.race_final_classes}
                  onChange={(e) => setForm({ ...form, race_final_classes: e.target.value })}
                  placeholder="Final classes (comma)"
                  style={{ padding: 12, borderRadius: 12, border: '2px solid #111', fontWeight: 800 }}
                />
              </>
            )}

          </>
        )}
      </div>

      {sections.advanced && (
        <div
          style={{
            marginTop: 24,
            background: '#fff',
            border: '2px solid #111',
            borderRadius: 16,
            padding: 16,
            display: 'grid',
            gap: 12,
          }}
        >
        <div style={{ fontWeight: 950, fontSize: 18 }}>Advanced Multi-Stage (Optional)</div>
        <div style={{ color: '#333', fontWeight: 700, fontSize: 13 }}>
          Aktifkan per category jika ingin memakai skema Qualification → Quarter → Semi → Finals. Default OFF.
        </div>

        {advancedLoading && (
          <div style={{ padding: 12, borderRadius: 12, border: '2px dashed #111', background: '#fff', fontWeight: 900 }}>
            Loading advanced config...
          </div>
        )}

        {!advancedLoading && advancedItems.length === 0 && (
          <div style={{ padding: 12, borderRadius: 12, border: '2px dashed #111', background: '#fff', fontWeight: 900 }}>
            Tidak ada kategori.
          </div>
        )}

        {!advancedLoading && advancedItems.length > 0 && (
          <div style={{ display: 'grid', gap: 10 }}>
            {advancedItems.map((item) => {
              const isOpen = advancedOpen[item.category.id] ?? false
              return (
              <div
                key={item.category.id}
                style={{
                  border: '2px solid #111',
                  borderRadius: 14,
                  padding: 12,
                  display: 'grid',
                  gap: 8,
                  background: '#eaf7ee',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                  <div style={{ fontWeight: 900 }}>{item.category.label}</div>
                  <button
                    type="button"
                    onClick={() => setAdvancedOpen((prev) => ({ ...prev, [item.category.id]: !isOpen }))}
                    style={{
                      padding: '4px 8px',
                      borderRadius: 999,
                      border: '2px solid #111',
                      background: isOpen ? '#bfead2' : '#fff',
                      fontWeight: 900,
                      fontSize: 11,
                      cursor: 'pointer',
                    }}
                  >
                    {isOpen ? 'Hide' : 'Show'}
                  </button>
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                  <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 800 }}>
                    <input
                      type="checkbox"
                      checked={item.config?.enabled ?? false}
                      onChange={(e) => saveAdvanced(item.category.id, e.target.checked)}
                      disabled={advancedSaving}
                    />
                    Enable Advanced Stage
                  </label>
                  <button
                    type="button"
                    onClick={() => runQualification(item.category.id)}
                    disabled={advancedSaving || !(item.config?.enabled ?? false)}
                    style={{
                      padding: '8px 12px',
                      borderRadius: 10,
                      border: '2px solid #111',
                      background: item.config?.enabled ? '#bfead2' : '#eee',
                      fontWeight: 900,
                      cursor: item.config?.enabled ? 'pointer' : 'not-allowed',
                    }}
                  >
                    Run Qualification
                  </button>
                  <button
                    type="button"
                    onClick={() => runAdvances(item.category.id)}
                    disabled={advancedSaving || !(item.config?.enabled ?? false)}
                    style={{
                      padding: '8px 12px',
                      borderRadius: 10,
                      border: '2px solid #111',
                      background: item.config?.enabled ? '#d7ecff' : '#eee',
                      fontWeight: 900,
                      cursor: item.config?.enabled ? 'pointer' : 'not-allowed',
                    }}
                  >
                    Compute QF/SF/Final
                  </button>
                  <button
                    type="button"
                    onClick={() => togglePreview(item.category.id)}
                    disabled={advancedSaving}
                    style={{
                      padding: '8px 12px',
                      borderRadius: 10,
                      border: '2px solid #111',
                      background: '#fff',
                      fontWeight: 900,
                      cursor: 'pointer',
                    }}
                  >
                    {previewOpen[item.category.id] ? 'Hide Preview' : 'Preview Results'}
                  </button>
                </div>

                {isOpen && (
                  <>
                    <div style={{ marginTop: 8, fontWeight: 900 }}>Rules</div>
                    <div
                      style={{
                        borderRadius: 12,
                        border: '2px solid #111',
                        background: '#f8fafc',
                        padding: 12,
                        display: 'grid',
                        gap: 10,
                      }}
                    >
                      <div style={{ fontWeight: 900 }}>Preset Standar per Jumlah Batch</div>
                      <div style={{ color: '#475569', fontWeight: 700, fontSize: 13 }}>
                        Gate size saat ini: {Math.max(1, Number(form.race_gate_positions) || 8)} rider per batch. Klik preset ini
                        untuk isi rule otomatis sesuai flow pushbike yang kita sepakati.
                      </div>
                      <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
                        {standardBatchPresetCards(Math.max(1, Number(form.race_gate_positions) || 8)).map((preset) => (
                          <div
                            key={preset.label}
                            style={{
                              borderRadius: 12,
                              border: '2px solid #111',
                              background: '#fff',
                              padding: 10,
                              display: 'grid',
                              gap: 6,
                            }}
                          >
                            <div style={{ fontWeight: 900 }}>{preset.label}</div>
                            <div style={{ color: '#475569', fontWeight: 800, fontSize: 12 }}>{preset.riderRange}</div>
                            <div style={{ fontWeight: 800, fontSize: 12 }}>{preset.summary}</div>
                            <div style={{ color: '#334155', fontWeight: 700, fontSize: 12 }}>
                              Finals: {preset.finals.join(', ')}
                            </div>
                          </div>
                        ))}
                      </div>
                      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          onClick={() => applyStandardBatchRules(item.category.id)}
                          disabled={advancedSaving}
                          style={{
                            padding: '8px 12px',
                            borderRadius: 10,
                            border: '2px solid #111',
                            background: '#fff1b8',
                            fontWeight: 900,
                            cursor: 'pointer',
                          }}
                        >
                          Apply Standard Batch Rules
                        </button>
                      </div>
                    </div>
                    {(rulesByCategory[item.category.id] ?? []).length === 0 && (
                      <div style={{ fontWeight: 800, color: '#333' }}>Belum ada rules.</div>
                    )}
                    {(rulesByCategory[item.category.id] ?? []).map((rule, idx) => (
                      <div
                        key={`${item.category.id}-${idx}`}
                        style={{
                          padding: 10,
                          borderRadius: 12,
                          border: '2px solid #111',
                          background: '#fff',
                          display: 'grid',
                          gap: 6,
                          fontWeight: 800,
                        }}
                        >
                          <div>Min riders: {rule.min_riders}</div>
                          {rule.enabled_final_classes.some((value) =>
                            legacyAdvancedFinalClasses.includes(value as (typeof legacyAdvancedFinalClasses)[number])
                          ) && (
                            <div style={{ color: '#b91c1c' }}>
                              Legacy final class terdeteksi: {rule.enabled_final_classes.join(', ')}
                            </div>
                          )}
                          <div>
                            Stages: Q={rule.enable_qualification ? 'ON' : 'OFF'} | QF=
                            {rule.enable_quarter_final ? 'ON' : 'OFF'} | SF=
                          {rule.enable_semi_final ? 'ON' : 'OFF'}
                        </div>
                        <div>Final classes: {rule.enabled_final_classes.join(', ') || '-'}</div>
                        <button
                          type="button"
                          onClick={() => removeRule(item.category.id, idx)}
                          disabled={advancedSaving}
                          style={{
                            padding: '6px 10px',
                            borderRadius: 10,
                            border: '2px solid #111',
                            background: '#ffd7d7',
                            fontWeight: 900,
                            cursor: 'pointer',
                            width: 'fit-content',
                          }}
                        >
                          Remove Rule
                        </button>
                      </div>
                    ))}

                    <div style={{ marginTop: 8, fontWeight: 900 }}>Add Rule</div>
                    <div style={{ display: 'grid', gap: 8 }}>
                      <input
                        type="number"
                        placeholder="min_riders"
                        value={draftRules[item.category.id]?.min_riders ?? 8}
                        onChange={(e) => updateDraft(item.category.id, { min_riders: Number(e.target.value) })}
                        style={{ padding: 10, borderRadius: 10, border: '2px solid #111', fontWeight: 800 }}
                      />
                      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        {(
                          [
                            { key: 'enable_qualification', label: 'Qualification' },
                            { key: 'enable_quarter_final', label: 'Quarter Final' },
                            { key: 'enable_semi_final', label: 'Semi Final' },
                          ] as const
                        ).map((opt) => (
                          <label key={opt.key} style={{ display: 'flex', gap: 6, alignItems: 'center', fontWeight: 800 }}>
                            <input
                              type="checkbox"
                              checked={Boolean(draftRules[item.category.id]?.[opt.key])}
                              onChange={(e) =>
                                updateDraft(item.category.id, { [opt.key]: e.target.checked } as Partial<CategoryRule>)
                              }
                            />
                            {opt.label}
                          </label>
                        ))}
                      </div>
                      <input
                        placeholder="Final classes (comma)"
                        value={(draftRules[item.category.id]?.enabled_final_classes ?? []).join(',')}
                        onChange={(e) =>
                          updateDraft(item.category.id, {
                            enabled_final_classes: e.target.value
                              .split(',')
                              .map((v) => v.trim())
                              .filter(Boolean),
                          })
                        }
                        style={{ padding: 10, borderRadius: 10, border: '2px solid #111', fontWeight: 800 }}
                      />
                      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          onClick={() => addRule(item.category.id)}
                          disabled={advancedSaving}
                          style={{
                            padding: '8px 12px',
                            borderRadius: 10,
                            border: '2px solid #111',
                            background: '#2ecc71',
                            fontWeight: 900,
                            cursor: 'pointer',
                          }}
                        >
                          Add Rule
                        </button>
                        <button
                          type="button"
                          onClick={() => saveRules(item.category.id)}
                          disabled={advancedSaving}
                          style={{
                            padding: '8px 12px',
                            borderRadius: 10,
                            border: '2px solid #111',
                            background: '#bfead2',
                            fontWeight: 900,
                            cursor: 'pointer',
                          }}
                        >
                          Save Rules
                        </button>
                      </div>
                    </div>

                    {previewOpen[item.category.id] && (
                      <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
                        <div style={{ fontWeight: 900 }}>Stage Results Preview</div>
                        {previewLoading[item.category.id] ? (
                          <div style={{ fontWeight: 800 }}>Loading...</div>
                        ) : (stagePreview[item.category.id] ?? []).length === 0 ? (
                          <div style={{ fontWeight: 800 }}>Belum ada hasil stage.</div>
                        ) : (
                          ['QUALIFICATION', 'QUARTER_FINAL', 'SEMI_FINAL', 'FINAL'].map((stage) => {
                            const rows = (stagePreview[item.category.id] ?? []).filter((r) => r.stage === stage)
                            if (rows.length === 0) return null
                            return (
                              <div
                                key={stage}
                                style={{
                                  padding: 10,
                                  borderRadius: 12,
                                  border: '2px solid #111',
                                  background: '#fff',
                                  display: 'grid',
                                  gap: 6,
                                }}
                              >
                                <div style={{ fontWeight: 900 }}>{stage}</div>
                                {rows.map((r) => (
                                  <div
                                    key={r.id}
                                    style={{ fontWeight: 800, display: 'flex', justifyContent: 'space-between' }}
                                  >
                                    <div>
                                      {r.riders?.no_plate_display ?? '-'} {r.riders?.name ?? '-'}
                                    </div>
                                    <div>
                                      {r.final_class ? `${r.final_class}` : r.position ? `Rank ${r.position}` : '-'}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )
                          })
                        )}
                      </div>
                    )}

                    <div style={{ marginTop: 12, display: 'grid', gap: 6 }}>
                      <div style={{ fontWeight: 900 }}>Auto-Generate Summary</div>
                      <div style={{ fontWeight: 800, color: '#333' }}>
                        Stage results: Q={summaryByCategory[item.category.id]?.stageCounts?.QUALIFICATION ?? 0} | QF=
                        {summaryByCategory[item.category.id]?.stageCounts?.QUARTER_FINAL ?? 0} | SF=
                        {summaryByCategory[item.category.id]?.stageCounts?.SEMI_FINAL ?? 0} | F=
                        {summaryByCategory[item.category.id]?.stageCounts?.FINAL ?? 0}
                      </div>
                      <div style={{ fontWeight: 800, color: '#333' }}>
                        Motos: QF={summaryByCategory[item.category.id]?.motoCounts?.quarter ?? 0} | SF=
                        {summaryByCategory[item.category.id]?.motoCounts?.semi ?? 0} | Final=
                        {summaryByCategory[item.category.id]?.motoCounts?.final ?? 0}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )})}
          </div>
        )}
        </div>
      )}

      <div
        style={{
          position: 'sticky',
          bottom: 12,
          marginTop: 20,
          border: '2px solid #111',
          borderRadius: 16,
          background: '#fff',
          padding: 12,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          boxShadow: '0 6px 18px rgba(0,0,0,0.08)',
        }}
      >
        <div style={{ display: 'grid', gap: 2 }}>
          <div style={{ fontWeight: 900 }}>Save Event Settings</div>
          <div style={{ fontSize: 12, color: '#333', fontWeight: 700 }}>
            {isDirty ? 'Unsaved changes' : `Saved: ${row?.updated_at ? new Date(row.updated_at).toLocaleString() : '-'}`}
          </div>
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          style={{
            padding: '10px 16px',
            borderRadius: 12,
            border: '2px solid #111',
            background: '#2ecc71',
            fontWeight: 950,
            cursor: 'pointer',
          }}
        >
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </div>
  )
}



