import { NextResponse } from 'next/server'
import { adminClient, requireBackoffice } from '../../../../../../lib/auth'
import {
  computeBestTeamLeaderboard,
  normalizeBestTeamConfig,
  type BestTeamCategoryGroup,
  type BestTeamStageGroup,
} from '../../../../../../lib/bestTeam'
import { GET as getLiveScore } from '../../../../public/events/[eventId]/live-score/route'

export const dynamic = 'force-dynamic'

type CategoryRow = {
  id: string
  label: string
}

type LiveScoreStageRow = {
  rider_id: string
  name?: string | null
  no_plate?: string | null
  club?: string | null
  rank?: number | null
  status?: string | null
}

type LiveScoreStage = {
  title: string
  rows: LiveScoreStageRow[]
}

export async function GET(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  const auth = await requireBackoffice(req.headers.get('authorization'), eventId)
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [{ data: settingsRows, error: settingsError }, { data: categoryRows, error: categoryError }] = await Promise.all([
    adminClient
      .from('event_settings')
      .select('business_settings')
      .eq('event_id', eventId)
      .order('updated_at', { ascending: false })
      .limit(1),
    adminClient
      .from('categories')
      .select('id, label')
      .eq('event_id', eventId)
      .eq('enabled', true),
  ])

  if (settingsError) return NextResponse.json({ error: settingsError.message }, { status: 400 })
  if (categoryError) return NextResponse.json({ error: categoryError.message }, { status: 400 })

  const settingsRow = (settingsRows ?? [])[0] ?? null
  const config = normalizeBestTeamConfig(
    settingsRow?.business_settings && typeof settingsRow.business_settings === 'object' && !Array.isArray(settingsRow.business_settings)
      ? settingsRow.business_settings
      : {}
  )

  if (!config.enabled) {
    return NextResponse.json({
      data: {
        enabled: false,
        label: config.label,
        scope: config.scope,
        point_rules: config.point_rules,
        club_aliases: config.club_aliases,
        rows: [],
      },
    })
  }

  const categories = (categoryRows ?? []) as CategoryRow[]
  let recapGroups: BestTeamCategoryGroup[] = []
  try {
    recapGroups = await Promise.all(
      categories.map(async (category): Promise<BestTeamCategoryGroup> => {
        const recapUrl = new URL(req.url)
        recapUrl.pathname = `/api/public/events/${eventId}/live-score`
        recapUrl.searchParams.set('category_id', category.id)
        recapUrl.searchParams.set('include_upcoming', '1')
        recapUrl.searchParams.set('include_photos', '0')

        const response = await getLiveScore(new Request(recapUrl.toString(), { method: 'GET', headers: req.headers }), {
          params: Promise.resolve({ eventId }),
        })
        const json = await response.json().catch(() => ({}))
        if (!response.ok) {
          throw new Error(json?.error || `Gagal memuat live score kategori ${category.label}.`)
        }

        const stages = (Array.isArray(json?.data?.stages) ? json.data.stages : []) as LiveScoreStage[]
        return {
          category_id: category.id,
          category_label: category.label,
          stages: stages.map(
            (stage): BestTeamStageGroup => ({
              title: stage.title,
              rows: Array.isArray(stage.rows) ? stage.rows : [],
            })
          ),
        }
      })
    )
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Gagal menghitung best team.' },
      { status: 400 }
    )
  }

  const rows = computeBestTeamLeaderboard(recapGroups, config)
  return NextResponse.json({
    data: {
      enabled: config.enabled,
      label: config.label,
      scope: config.scope,
      point_rules: config.point_rules,
      club_aliases: config.club_aliases,
      rows,
    },
  })
}
