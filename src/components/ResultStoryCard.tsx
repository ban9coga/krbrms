'use client'

export type ResultStoryCardData = {
  eventTitle: string
  eventBrand?: string | null
  eventDate?: string | null
  eventLocation?: string | null
  categoryLabel: string
  classLabel?: string | null
  riderName: string
  plateNumber?: string | null
  rankNumber?: number | null
  totalPoint?: number | null
  statusLabel?: string | null
  operatorLabel?: string | null
  scoringSupportLabel?: string | null
}

const formatDate = (value?: string | null) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date)
}

const escapeSvg = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')

const rankPalette = (rank?: number | null) => {
  if (rank === 1) return { badge: '#fbbf24', glow: 'rgba(251,191,36,0.38)', label: 'Podium Winner' }
  if (rank === 2) return { badge: '#cbd5e1', glow: 'rgba(203,213,225,0.34)', label: 'Podium Finish' }
  if (rank === 3) return { badge: '#fb923c', glow: 'rgba(251,146,60,0.32)', label: 'Podium Finish' }
  return { badge: '#38bdf8', glow: 'rgba(56,189,248,0.28)', label: 'Official Result' }
}

export function buildResultStoryCardSvg(data: ResultStoryCardData) {
  const width = 1080
  const height = 1920
  const rank = data.rankNumber ?? null
  const palette = rankPalette(rank)
  const rankText = rank ? `#${rank}` : data.statusLabel || 'RESULT'
  const metaLine = [formatDate(data.eventDate), data.eventLocation].filter(Boolean).join('  •  ')
  const subLine = [data.categoryLabel, data.classLabel ? `Class ${data.classLabel}` : null].filter(Boolean).join('  •  ')
  const operatorLine = data.operatorLabel ? `Operating Committee: ${data.operatorLabel}` : ''
  const scoringLine = data.scoringSupportLabel ? `Scoring Support: ${data.scoringSupportLabel}` : ''
  const pointLine = data.totalPoint != null ? `${data.totalPoint} pts` : data.statusLabel || 'Final Result'

  return `
  <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#0f172a" />
        <stop offset="50%" stop-color="#1e293b" />
        <stop offset="100%" stop-color="#78350f" />
      </linearGradient>
      <linearGradient id="amberGlow" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#fde68a" stop-opacity="0.32" />
        <stop offset="100%" stop-color="#f59e0b" stop-opacity="0" />
      </linearGradient>
      <filter id="softGlow">
        <feGaussianBlur stdDeviation="24" />
      </filter>
    </defs>

    <rect width="${width}" height="${height}" rx="56" fill="url(#bg)" />
    <circle cx="170" cy="1710" r="230" fill="url(#amberGlow)" />
    <circle cx="920" cy="280" r="190" fill="${palette.glow}" filter="url(#softGlow)" />
    <circle cx="912" cy="278" r="142" fill="none" stroke="rgba(255,255,255,0.14)" stroke-width="4" />

    <rect x="72" y="70" width="936" height="1780" rx="44" fill="rgba(15,23,42,0.42)" stroke="rgba(255,255,255,0.10)" stroke-width="3" />

    <text x="118" y="150" fill="#fbbf24" font-size="34" font-weight="900" letter-spacing="7" font-family="Arial, Helvetica, sans-serif">OFFICIAL RESULT</text>
    <text x="118" y="218" fill="#ffffff" font-size="68" font-weight="900" font-family="Arial, Helvetica, sans-serif">${escapeSvg(data.eventTitle)}</text>
    <text x="118" y="266" fill="#cbd5e1" font-size="30" font-weight="700" font-family="Arial, Helvetica, sans-serif">${escapeSvg(data.eventBrand || 'Pushbike Race Management Platform')}</text>
    <text x="118" y="314" fill="#94a3b8" font-size="24" font-weight="700" font-family="Arial, Helvetica, sans-serif">${escapeSvg(metaLine || 'Event Result')}</text>

    <rect x="118" y="390" width="844" height="300" rx="36" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.10)" stroke-width="2" />
    <text x="118" y="470" fill="#fde68a" font-size="28" font-weight="900" letter-spacing="5" font-family="Arial, Helvetica, sans-serif">RIDER</text>
    <text x="118" y="560" fill="#ffffff" font-size="78" font-style="italic" font-weight="900" font-family="Arial, Helvetica, sans-serif">${escapeSvg(data.riderName)}</text>
    <text x="118" y="616" fill="#cbd5e1" font-size="28" font-weight="700" font-family="Arial, Helvetica, sans-serif">${escapeSvg(subLine)}</text>
    <text x="118" y="662" fill="#94a3b8" font-size="24" font-weight="700" font-family="Arial, Helvetica, sans-serif">${escapeSvg(data.plateNumber ? `No Plate ${data.plateNumber}` : '')}</text>

    <g>
      <circle cx="864" cy="930" r="160" fill="${palette.badge}" />
      <circle cx="864" cy="930" r="182" fill="none" stroke="${palette.badge}" stroke-opacity="0.28" stroke-width="14" />
      <text x="864" y="905" text-anchor="middle" fill="#0f172a" font-size="46" font-weight="900" font-family="Arial, Helvetica, sans-serif">RANK</text>
      <text x="864" y="985" text-anchor="middle" fill="#0f172a" font-size="98" font-weight="900" font-family="Arial, Helvetica, sans-serif">${escapeSvg(rankText)}</text>
    </g>

    <rect x="118" y="820" width="572" height="290" rx="36" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.10)" stroke-width="2" />
    <text x="154" y="900" fill="#f8fafc" font-size="26" font-weight="800" letter-spacing="4" font-family="Arial, Helvetica, sans-serif">CLASS RESULT</text>
    <text x="154" y="990" fill="#ffffff" font-size="64" font-weight="900" font-family="Arial, Helvetica, sans-serif">${escapeSvg(data.classLabel || 'General')}</text>
    <text x="154" y="1052" fill="#fbbf24" font-size="32" font-weight="900" font-family="Arial, Helvetica, sans-serif">${escapeSvg(pointLine)}</text>

    <rect x="118" y="1184" width="844" height="260" rx="36" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.10)" stroke-width="2" />
    <text x="154" y="1260" fill="#f8fafc" font-size="26" font-weight="800" letter-spacing="4" font-family="Arial, Helvetica, sans-serif">EVENT NOTES</text>
    <text x="154" y="1332" fill="#ffffff" font-size="34" font-weight="700" font-family="Arial, Helvetica, sans-serif">${escapeSvg(palette.label)}</text>
    <text x="154" y="1384" fill="#cbd5e1" font-size="26" font-weight="700" font-family="Arial, Helvetica, sans-serif">${escapeSvg(operatorLine)}</text>
    <text x="154" y="1430" fill="#cbd5e1" font-size="26" font-weight="700" font-family="Arial, Helvetica, sans-serif">${escapeSvg(scoringLine)}</text>

    <text x="118" y="1708" fill="#94a3b8" font-size="24" font-weight="700" font-family="Arial, Helvetica, sans-serif">Share this result to WhatsApp Story or Instagram Story.</text>
    <text x="118" y="1784" fill="#fde68a" font-size="34" font-weight="900" letter-spacing="4" font-family="Arial, Helvetica, sans-serif">PUSHBIKE RACE MANAGEMENT PLATFORM</text>
  </svg>
  `.trim()
}

export default function ResultStoryCard({ data, compact = false }: { data: ResultStoryCardData; compact?: boolean }) {
  const palette = rankPalette(data.rankNumber)
  return (
    <div
      style={{
        width: compact ? 320 : 360,
        aspectRatio: '9 / 16',
        borderRadius: 28,
        overflow: 'hidden',
        position: 'relative',
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 52%, #78350f 100%)',
        color: '#fff',
        border: '1px solid rgba(255,255,255,0.12)',
        boxShadow: '0 18px 50px rgba(15,23,42,0.28)',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 'auto auto -60px -30px',
          width: 180,
          height: 180,
          borderRadius: '50%',
          background: 'rgba(251,191,36,0.16)',
          filter: 'blur(40px)',
        }}
      />
      <div style={{ position: 'absolute', inset: 18, borderRadius: 22, border: '1px solid rgba(255,255,255,0.08)' }} />
      <div style={{ position: 'relative', zIndex: 1, height: '100%', padding: '22px 22px 20px', display: 'grid', gridTemplateRows: 'auto auto 1fr auto', gap: 16 }}>
        <div style={{ display: 'grid', gap: 4 }}>
          <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: '0.22em', textTransform: 'uppercase', color: '#fbbf24' }}>Official Result</div>
          <div style={{ fontSize: compact ? 24 : 28, fontWeight: 900, lineHeight: 1.05 }}>{data.eventTitle}</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#cbd5e1' }}>{data.eventBrand || 'Pushbike Race Management Platform'}</div>
        </div>

        <div style={{ display: 'grid', gap: 4 }}>
          <div style={{ fontSize: compact ? 30 : 34, fontWeight: 900, fontStyle: 'italic', lineHeight: 1.05 }}>{data.riderName}</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0' }}>
            {[data.categoryLabel, data.classLabel ? `Class ${data.classLabel}` : null].filter(Boolean).join(' • ')}
          </div>
          {data.plateNumber && <div style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8' }}>No Plate {data.plateNumber}</div>}
        </div>

        <div style={{ display: 'grid', alignContent: 'center', justifyItems: 'center', gap: 16 }}>
          <div
            style={{
              width: compact ? 138 : 156,
              height: compact ? 138 : 156,
              borderRadius: '50%',
              background: palette.badge,
              color: '#0f172a',
              display: 'grid',
              placeItems: 'center',
              boxShadow: `0 0 0 12px ${palette.glow}`,
            }}
          >
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 13, fontWeight: 900, letterSpacing: '0.18em', textTransform: 'uppercase' }}>Rank</div>
              <div style={{ fontSize: compact ? 44 : 54, fontWeight: 900, lineHeight: 1 }}>{data.rankNumber ? `#${data.rankNumber}` : data.statusLabel || 'RESULT'}</div>
            </div>
          </div>
          <div style={{ fontSize: compact ? 24 : 28, fontWeight: 900 }}>{data.classLabel || 'General'}</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#fcd34d' }}>{data.totalPoint != null ? `${data.totalPoint} pts` : data.statusLabel || 'Final Result'}</div>
        </div>

        <div style={{ display: 'grid', gap: 6 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#cbd5e1' }}>{[formatDate(data.eventDate), data.eventLocation].filter(Boolean).join(' • ') || 'Event Result'}</div>
          {data.operatorLabel && <div style={{ fontSize: 12, fontWeight: 700, color: '#cbd5e1' }}>Operating Committee: {data.operatorLabel}</div>}
          {data.scoringSupportLabel && <div style={{ fontSize: 12, fontWeight: 700, color: '#cbd5e1' }}>Scoring Support: {data.scoringSupportLabel}</div>}
          <div style={{ fontSize: 11, fontWeight: 800, color: '#94a3b8', marginTop: 4 }}>Ready to share to WhatsApp Story / Instagram Story</div>
        </div>
      </div>
    </div>
  )
}
