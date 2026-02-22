type Props = {
  label: string
  tone?: 'light' | 'dark'
}

export default function StatusBadge({ label, tone = 'light' }: Props) {
  const normalized = label.toUpperCase()
  const isLive = normalized.includes('LIVE') || normalized.includes('ONGOING')
  const isUpcoming = normalized.includes('UPCOMING') || normalized.includes('COMING')
  const background = isLive ? '#e9fff1' : isUpcoming ? '#f5f7fa' : '#fff'
  const border = isLive ? '1px solid rgba(15, 23, 42, 0.18)' : '1px solid rgba(15, 23, 42, 0.12)'
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
        letterSpacing: '0.04em',
      }}
    >
      {label}
    </span>
  )
}
