export default function LoadingState({ label = 'Memuat...' }: { label?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white/85 p-4 text-sm font-semibold text-slate-600 shadow-[0_10px_25px_rgba(15,23,42,0.08)]">
      <span className="inline-flex items-center gap-2">
        <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-amber-400" />
        {label}
      </span>
    </div>
  )
}
