export default function EmptyState({ label }: { label: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white/75 p-4 text-sm font-semibold text-slate-500">
      {label}
    </div>
  )
}
