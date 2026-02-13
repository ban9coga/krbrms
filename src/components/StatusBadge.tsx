type Props = {
  label: string
  tone?: 'light' | 'dark'
}

export default function StatusBadge({ label, tone = 'light' }: Props) {
  const normalized = label.toUpperCase()
  const isLive = normalized.includes('LIVE') || normalized.includes('ONGOING')
  const isUpcoming = normalized.includes('UPCOMING') || normalized.includes('COMING')
  const background = isLive ? '#ffe34f' : isUpcoming ? '#fff7d6' : '#fff'
  const border = isLive ? '2px solid #111' : '2px dashed #111'
  const color = tone === 'dark' ? '#111' : '#111'

  return (
    <span
      style={{
        display: 'inline-block',
        padding: '4px 10px',
        borderRadius: '999px',
        border,
        background,
        color,
        fontWeight: 800,
        fontSize: '12px',
        letterSpacing: '0.08em',
      }}
    >
      {label}
    </span>
  )
}
