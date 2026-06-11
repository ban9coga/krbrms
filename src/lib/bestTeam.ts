import type { BusinessSettings } from './eventService'

export type BestTeamScope = 'ALL_FINALS' | 'FINAL_ELITE'

export type BestTeamPointRule = {
  rank: number
  points: number
}

export type BestTeamClubAlias = {
  source: string
  target: string
}

export type BestTeamStageRow = {
  rider_id: string
  name?: string | null
  no_plate?: string | null
  club?: string | null
  rank?: number | null
  status?: string | null
}

export type BestTeamStageGroup = {
  title: string
  rows: BestTeamStageRow[]
}

export type BestTeamCategoryGroup = {
  category_id?: string | null
  category_label?: string | null
  stages: BestTeamStageGroup[]
}

export type BestTeamEntry = {
  rider_id: string
  rider_name: string
  no_plate: string
  raw_club: string
  team_name: string
  category_label: string
  stage_title: string
  rank: number
  awarded_points: number
  status: string
}

export type BestTeamLeaderboardRow = {
  team_name: string
  total_points: number
  wins: number
  podiums: number
  rider_count: number
  entries: BestTeamEntry[]
}

export type BestTeamConfig = {
  enabled: boolean
  label: string
  scope: BestTeamScope
  point_rules: BestTeamPointRule[]
  club_aliases: BestTeamClubAlias[]
}

export const DEFAULT_BEST_TEAM_POINT_RULES: BestTeamPointRule[] = [
  { rank: 1, points: 10 },
  { rank: 2, points: 8 },
  { rank: 3, points: 6 },
  { rank: 4, points: 5 },
  { rank: 5, points: 4 },
  { rank: 6, points: 3 },
  { rank: 7, points: 2 },
  { rank: 8, points: 1 },
]

const normalizeWhitespace = (value: string) => value.replace(/\s+/g, ' ').trim()

const normalizeKey = (value: string) => normalizeWhitespace(value).toLowerCase()

export const normalizeBestTeamScope = (value: unknown): BestTeamScope =>
  value === 'FINAL_ELITE' ? 'FINAL_ELITE' : 'ALL_FINALS'

export const normalizeBestTeamPointRules = (value: unknown): BestTeamPointRule[] => {
  const rawItems = Array.isArray(value) ? value : []
  const normalized = rawItems
    .map((item) => {
      const rank = Number((item as { rank?: unknown })?.rank)
      const points = Number((item as { points?: unknown })?.points)
      if (!Number.isFinite(rank) || rank < 1 || !Number.isFinite(points)) return null
      return {
        rank: Math.max(1, Math.floor(rank)),
        points: Math.floor(points),
      }
    })
    .filter((item): item is BestTeamPointRule => item !== null)
    .sort((a, b) => a.rank - b.rank)
    .filter((item, index, array) => array.findIndex((entry) => entry.rank === item.rank) === index)

  return normalized.length > 0 ? normalized : DEFAULT_BEST_TEAM_POINT_RULES
}

export const normalizeBestTeamClubAliases = (value: unknown): BestTeamClubAlias[] => {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => {
      const source = typeof (item as { source?: unknown })?.source === 'string' ? normalizeWhitespace((item as { source: string }).source) : ''
      const target = typeof (item as { target?: unknown })?.target === 'string' ? normalizeWhitespace((item as { target: string }).target) : ''
      if (!source || !target) return null
      return { source, target }
    })
    .filter((item): item is BestTeamClubAlias => item !== null)
    .filter((item, index, array) => array.findIndex((entry) => normalizeKey(entry.source) === normalizeKey(item.source)) === index)
}

export const normalizeBestTeamConfig = (settings: BusinessSettings | null | undefined): BestTeamConfig => {
  const source = settings ?? {}
  return {
    enabled: typeof source.best_team_enabled === 'boolean' ? source.best_team_enabled : false,
    label: typeof source.best_team_label === 'string' && source.best_team_label.trim() ? source.best_team_label.trim() : 'Best Team',
    scope: normalizeBestTeamScope(source.best_team_scope),
    point_rules: normalizeBestTeamPointRules(source.best_team_point_rules),
    club_aliases: normalizeBestTeamClubAliases(source.best_team_club_aliases),
  }
}

export const applyBestTeamSettingsNormalization = (settings: BusinessSettings): BusinessSettings => {
  const normalized = normalizeBestTeamConfig(settings)
  return {
    ...settings,
    best_team_enabled: normalized.enabled,
    best_team_label: normalized.label,
    best_team_scope: normalized.scope,
    best_team_point_rules: normalized.point_rules,
    best_team_club_aliases: normalized.club_aliases,
  }
}

export const isBestTeamFinalStage = (title: string, scope: BestTeamScope) => {
  const normalized = normalizeWhitespace(title).toLowerCase()
  if (!normalized.startsWith('final')) return false
  if (scope === 'FINAL_ELITE') return /^final\s+elite\b/i.test(normalized)
  return true
}

export const resolveBestTeamName = (rawClub: string | null | undefined, aliases: BestTeamClubAlias[]) => {
  const normalizedClub = normalizeWhitespace(rawClub ?? '')
  if (!normalizedClub) return 'Tanpa Club'
  const alias = aliases.find((item) => normalizeKey(item.source) === normalizeKey(normalizedClub))
  return alias?.target || normalizedClub
}

export const computeBestTeamLeaderboard = (
  categories: BestTeamCategoryGroup[],
  config: BestTeamConfig
): BestTeamLeaderboardRow[] => {
  if (!config.enabled) return []

  const pointMap = new Map<number, number>(config.point_rules.map((item) => [item.rank, item.points]))
  const teams = new Map<string, BestTeamLeaderboardRow>()

  for (const category of categories) {
    for (const stage of category.stages) {
      if (!isBestTeamFinalStage(stage.title, config.scope)) continue

      for (const row of stage.rows) {
        const rank = typeof row.rank === 'number' && Number.isFinite(row.rank) ? row.rank : null
        if (!rank) continue

        const status = typeof row.status === 'string' ? row.status.trim().toUpperCase() : 'FINISH'
        const teamName = resolveBestTeamName(row.club, config.club_aliases)
        const awardedPoints = status === 'DQ' ? 0 : pointMap.get(rank) ?? 0
        const existing =
          teams.get(teamName) ??
          {
            team_name: teamName,
            total_points: 0,
            wins: 0,
            podiums: 0,
            rider_count: 0,
            entries: [],
          }

        existing.total_points += awardedPoints
        existing.wins += rank === 1 ? 1 : 0
        existing.podiums += rank <= 3 ? 1 : 0
        existing.rider_count += 1
        existing.entries.push({
          rider_id: row.rider_id,
          rider_name: typeof row.name === 'string' ? row.name : '-',
          no_plate: typeof row.no_plate === 'string' ? row.no_plate : '-',
          raw_club: normalizeWhitespace(row.club ?? '') || 'Tanpa Club',
          team_name: teamName,
          category_label: typeof category.category_label === 'string' ? category.category_label : '-',
          stage_title: stage.title,
          rank,
          awarded_points: awardedPoints,
          status,
        })
        teams.set(teamName, existing)
      }
    }
  }

  return Array.from(teams.values()).sort((a, b) => {
    if (b.total_points !== a.total_points) return b.total_points - a.total_points
    if (b.wins !== a.wins) return b.wins - a.wins
    if (b.podiums !== a.podiums) return b.podiums - a.podiums
    if (b.rider_count !== a.rider_count) return b.rider_count - a.rider_count
    return a.team_name.localeCompare(b.team_name)
  })
}
