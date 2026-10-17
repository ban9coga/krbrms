import Link from 'next/link'
import { getEventSetupChecklist } from './actions'

const STATUS: Record<string, { label: string; color: string; marker: string }> = {
  done: { label: 'Selesai', color: 'border-emerald-200 bg-emerald-50 text-emerald-800', marker: 'bg-emerald-500' },
  warning: { label: 'Perlu dicek', color: 'border-amber-200 bg-amber-50 text-amber-900', marker: 'bg-amber-500' },
  todo: { label: 'Belum mulai', color: 'border-slate-200 bg-white text-slate-600', marker: 'bg-slate-300' },
}

export default async function ChecklistPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  const items = await getEventSetupChecklist(eventId)
  const requiredItems = items.filter((item) => item.required)
  const completeCount = requiredItems.filter((item) => item.status === 'done').length
  const percent = requiredItems.length ? Math.round((completeCount / requiredItems.length) * 100) : 0
  const nextItem = requiredItems.find((item) => item.status !== 'done')
  const optionalItems = items.filter((item) => !item.required)

  return (
    <main className="mx-auto grid w-full max-w-5xl gap-5 pb-10">
      <section className="admin-card grid gap-5 p-5 sm:p-6">
        <div>
          <p className="admin-kicker">Persiapan event</p>
          <h1 className="admin-heading mt-1 text-2xl">Setup event, langkah demi langkah</h1>
          <p className="admin-muted mt-2 max-w-2xl text-sm">
            Selesaikan langkah wajib untuk menyiapkan event sampai drawing batch dan gate siap.
          </p>
        </div>

        <div className="grid gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="font-bold text-slate-700">Kesiapan setup</span>
            <span className="font-black text-slate-950">{completeCount} dari {requiredItems.length} langkah wajib - {percent}%</span>
          </div>
          <div
            className="h-2.5 overflow-hidden rounded-full bg-slate-100"
            role="progressbar"
            aria-label="Progres setup event"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
          >
            <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${percent}%` }} />
          </div>
        </div>

        {nextItem ? (
          <div className="flex flex-col gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase text-amber-800">Langkah berikutnya - {nextItem.step}</p>
              <p className="mt-1 text-base font-extrabold text-slate-950">{nextItem.label}</p>
              <p className="mt-1 text-sm text-slate-700">{nextItem.detail}</p>
            </div>
            <Link href={nextItem.href} className="admin-primary-button shrink-0 text-center">
              {nextItem.action}
            </Link>
          </div>
        ) : (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
            <p className="font-extrabold text-emerald-900">Setup wajib selesai. Event siap menuju pemeriksaan race.</p>
          </div>
        )}
      </section>

      <section className="admin-card grid gap-3 p-4 sm:p-5">
        <div>
          <h2 className="admin-heading text-lg">Setup wajib</h2>
          <p className="admin-muted mt-1 text-sm">Ikuti urutan ini. Pilih langkah untuk langsung membuka pengaturannya.</p>
        </div>
        <div className="grid gap-2">
          {requiredItems.map((item) => {
            const status = STATUS[item.status]
            const isNext = nextItem?.key === item.key
            return (
              <Link
                key={item.key}
                href={item.href}
                className={`grid grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-3 rounded-lg border p-3 transition-colors hover:border-amber-400 ${isNext ? 'border-amber-300 bg-amber-50/50' : 'border-slate-200 bg-white'}`}
              >
                <span className={`grid h-9 w-9 place-items-center rounded-full text-sm font-black ${item.status === 'done' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'}`}>
                  {item.status === 'done' ? 'OK' : item.step}
                </span>
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-extrabold text-slate-950">{item.label}</span>
                    {isNext && <span className="text-[10px] font-black uppercase text-amber-800">Berikutnya</span>}
                  </span>
                  <span className="mt-0.5 block text-xs text-slate-500">{item.description}</span>
                  <span className="mt-0.5 block text-sm text-slate-600">{item.detail}</span>
                </span>
                <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ${status.color}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${status.marker}`} />
                  {status.label}
                </span>
              </Link>
            )
          })}
        </div>
      </section>

      <details className="admin-card p-4 sm:p-5">
        <summary className="cursor-pointer list-none font-extrabold text-slate-900">
          Pengaturan tambahan <span className="ml-1 text-sm font-semibold text-slate-500">(opsional)</span>
        </summary>
        <div className="mt-3 grid gap-2">
          {optionalItems.map((item) => {
            const status = STATUS[item.status]
            return (
              <Link key={item.key} href={item.href} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3 hover:border-amber-400">
                <span>
                  <span className="block font-bold text-slate-900">{item.label}</span>
                  <span className="mt-0.5 block text-sm text-slate-600">{item.detail}</span>
                </span>
                <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${status.color}`}>{status.label}</span>
              </Link>
            )
          })}
        </div>
      </details>
    </main>
  )
}
