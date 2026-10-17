import CategoriesClient from '@/src/app/admin/events/[eventId]/categories/CategoriesClient'
import Link from 'next/link'

export default async function RcAdminCategoriesPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  return <main className="min-h-screen bg-slate-50 px-4 py-5 text-slate-950 sm:px-6">
    <div className="mx-auto max-w-5xl">
      <Link href={`/rc-admin/events/${eventId}`} className="text-sm font-bold text-slate-600 hover:text-amber-800">&larr; Kembali ke event</Link>
      <div className="mt-5 rounded-lg border border-slate-200 bg-white p-4 sm:p-6">
        <p className="text-xs font-black uppercase text-amber-800">Setup event</p>
        <h1 className="mt-1 text-2xl font-black">Kategori</h1>
        <p className="mb-5 mt-1 text-sm text-slate-600">Buat kategori manual atau susun otomatis dari tahun lahir rider.</p>
        <CategoriesClient eventId={eventId} />
      </div>
    </div>
  </main>
}
