'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useApiFetch } from '@/src/hooks/useApiFetch'
import { getInsightCategoryLabel, type InsightCategory } from '@/src/lib/insightCategories'

type ContentListItem = {
  id: string
  topic: string
  title: string
  category: InsightCategory
  insight_status: 'DRAFT' | 'PUBLISHED'
  instagram_status: 'NOT_READY' | 'READY' | 'POSTED'
  updated_at: string
  published_at: string | null
}

type StatusFilter = 'ALL' | 'DRAFT' | 'PUBLISHED'

const formatDate = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
    : '-'

const statusClass = (status: string) =>
  status === 'PUBLISHED'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
    : status === 'READY'
    ? 'border-sky-200 bg-sky-50 text-sky-700'
    : status === 'POSTED'
    ? 'border-violet-200 bg-violet-50 text-violet-700'
    : 'border-slate-200 bg-slate-100 text-slate-600'

export default function ContentListClient() {
  const apiFetch = useApiFetch()
  const [items, setItems] = useState<ContentListItem[]>([])
  const [filter, setFilter] = useState<StatusFilter>('ALL')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const query = new URLSearchParams()
      if (filter !== 'ALL') query.set('status', filter)
      if (search.trim()) query.set('q', search.trim())
      const json = await apiFetch(`/api/admin/content${query.size ? `?${query.toString()}` : ''}`)
      setItems(json.data ?? [])
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Gagal memuat Content Studio.')
    } finally {
      setLoading(false)
    }
  }, [apiFetch, filter, search])

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), search ? 220 : 0)
    return () => window.clearTimeout(timer)
  }, [load, search])

  const deleteContent = useCallback(async (item: ContentListItem) => {
    const confirmed = window.confirm(
      `Hapus konten "${item.title}"? Artikel Insight dan paket Instagram terkait juga akan dihapus. Tindakan ini tidak bisa dibatalkan.`
    )
    if (!confirmed) return

    setDeletingId(item.id)
    setError(null)
    try {
      await apiFetch(`/api/admin/content/${item.id}`, { method: 'DELETE' })
      setItems((previous) => previous.filter((current) => current.id !== item.id))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Gagal menghapus konten.')
    } finally {
      setDeletingId(null)
    }
  }, [apiFetch])

  const summary = useMemo(
    () => ({
      all: items.length,
      published: items.filter((item) => item.insight_status === 'PUBLISHED').length,
      draft: items.filter((item) => item.insight_status === 'DRAFT').length,
    }),
    [items]
  )

  return (
    <main className="admin-page-shell">
      <section className="admin-surface px-6 py-7 lg:px-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="admin-kicker">RacePushbike Content Studio</div>
            <h1 className="admin-heading mt-1 text-3xl">Satu topik, semua materi konten.</h1>
            <p className="admin-muted mt-3 max-w-2xl text-sm font-semibold leading-6">
              Siapkan artikel Insight, carousel Instagram, caption, SEO, dan aset visual dalam satu alur kerja.
            </p>
          </div>
          <Link href="/admin/content/new" className="admin-primary-button w-fit">
            + Buat Konten
          </Link>
        </div>
      </section>

      <section className="mt-5 grid gap-3 sm:grid-cols-3">
        <article className="admin-card"><div className="admin-kicker">Total tampil</div><strong className="admin-heading mt-2 block text-2xl">{summary.all}</strong></article>
        <article className="admin-card"><div className="admin-kicker">Published</div><strong className="admin-heading mt-2 block text-2xl">{summary.published}</strong></article>
        <article className="admin-card"><div className="admin-kicker">Draft</div><strong className="admin-heading mt-2 block text-2xl">{summary.draft}</strong></article>
      </section>

      <section className="admin-surface mt-5 p-5 lg:p-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2" aria-label="Filter status konten">
            {(['ALL', 'DRAFT', 'PUBLISHED'] as StatusFilter[]).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setFilter(item)}
                className={filter === item ? 'admin-primary-button' : 'admin-outline-button'}
              >
                {item === 'ALL' ? 'All' : item === 'DRAFT' ? 'Draft' : 'Published'}
              </button>
            ))}
          </div>
          <label className="block lg:w-[360px]">
            <span className="sr-only">Cari konten</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Cari judul atau topik..."
              className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-200"
            />
          </label>
        </div>

        {error ? <div className="admin-alert-danger mt-5">{error}</div> : null}
        {loading ? (
          <div className="mt-5 grid gap-3">{Array.from({ length: 4 }).map((_, index) => <div key={index} className="admin-skeleton h-20" />)}</div>
        ) : items.length === 0 ? (
          <div className="mt-5 border border-dashed border-slate-300 px-5 py-12 text-center">
            <h2 className="admin-heading text-xl">Belum ada konten yang cocok.</h2>
            <p className="admin-muted mt-2 text-sm">Mulai dari satu topik, lalu susun Insight dan Instagram dari editor yang sama.</p>
          </div>
        ) : (
          <div className="mt-5 overflow-x-auto rounded-lg border border-slate-200">
            <table className="min-w-[880px] w-full border-collapse text-left text-sm">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-[0.12em] text-slate-500">
                <tr>
                  <th className="px-4 py-3">Title / Topic</th>
                  <th className="px-4 py-3">Insight</th>
                  <th className="px-4 py-3">Instagram</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Updated</th>
                  <th className="px-4 py-3">Published</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {items.map((item) => (
                  <tr key={item.id}>
                    <td className="px-4 py-4"><strong className="block text-slate-900">{item.title}</strong><span className="mt-1 block text-xs text-slate-500">{item.topic}</span></td>
                    <td className="px-4 py-4"><span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-extrabold ${statusClass(item.insight_status)}`}>{item.insight_status}</span></td>
                    <td className="px-4 py-4"><span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-extrabold ${statusClass(item.instagram_status)}`}>{item.instagram_status.replace('_', ' ')}</span></td>
                    <td className="px-4 py-4 font-semibold text-slate-700">{getInsightCategoryLabel(item.category)}</td>
                    <td className="px-4 py-4 text-xs font-semibold text-slate-500">{formatDate(item.updated_at)}</td>
                    <td className="px-4 py-4 text-xs font-semibold text-slate-500">{formatDate(item.published_at)}</td>
                    <td className="px-4 py-4 text-right">
                      <div className="inline-flex items-center justify-end gap-2">
                        <Link href={`/admin/content/${item.id}`} className="admin-outline-button">Edit</Link>
                        <button
                          type="button"
                          onClick={() => void deleteContent(item)}
                          disabled={deletingId !== null}
                          className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-extrabold text-rose-700 transition-colors hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {deletingId === item.id ? 'Menghapus...' : 'Hapus'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  )
}
