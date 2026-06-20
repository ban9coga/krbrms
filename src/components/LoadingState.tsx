export default function LoadingState({ label = 'Memuat...' }: { label?: string }) {
  return (
    <div
      className="grid min-h-28 place-items-center gap-2 rounded-2xl border border-slate-200 bg-white/85 p-4 text-center shadow-[0_10px_25px_rgba(15,23,42,0.08)]"
      role="status"
      aria-live="polite"
    >
      <div className="loading-bars" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
        <span />
      </div>
      <span className="text-xs font-extrabold uppercase tracking-[0.12em] text-slate-600">{label}</span>
    </div>
  )
}
