type Props = {
  label: string
  tone?: 'light' | 'dark'
}

export default function StatusBadge({ label, tone = 'light' }: Props) {
  const normalized = label.toUpperCase()
  const isLive = normalized.includes('LIVE') || normalized.includes('ONGOING')
  const isUpcoming = normalized.includes('UPCOMING') || normalized.includes('COMING')
  const isLocked = normalized.includes('LOCK') || normalized.includes('PROTEST')
  const toneClass =
    tone === 'dark'
      ? 'border-white/25 bg-white/15 text-white'
      : isLive
      ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
      : isUpcoming
      ? 'border-sky-200 bg-sky-50 text-sky-700'
      : isLocked
      ? 'border-amber-200 bg-amber-50 text-amber-700'
      : 'border-slate-200 bg-slate-100 text-slate-700'

  return (
    <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-extrabold tracking-[0.08em] ${toneClass}`}>
      {label}
    </span>
  )
}
