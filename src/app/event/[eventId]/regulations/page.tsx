import Link from 'next/link'
import { notFound } from 'next/navigation'
import PublicTopbar from '../../../../components/PublicTopbar'
import { adminClient } from '../../../../lib/auth'
import type { PublicEventRegulation } from '../../../../lib/eventService'

export const revalidate = 60

const stageLabels: Record<string, string> = {
  QUALIFICATION: 'Kualifikasi', QUARTER_FINAL: 'Quarter Final', REPECHAGE: 'Repechage',
  SEMI_FINAL: 'Semi Final', FINAL: 'Final',
}

const getSafeDocumentUrl = (value?: string | null) => {
  if (!value) return null
  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : null
  } catch {
    return null
  }
}

export default async function PublicEventRegulationsPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  const [{ data: event }, { data: settings }, { data: categories }] = await Promise.all([
    adminClient.from('events').select('id, name, is_public').eq('id', eventId).maybeSingle(),
    adminClient.from('event_settings').select('business_settings').eq('event_id', eventId).maybeSingle(),
    adminClient.from('categories').select('id, label, enabled, sequence_order').eq('event_id', eventId).eq('enabled', true).order('sequence_order', { ascending: true }),
  ])
  if (!event || event.is_public === false) notFound()

  const business = settings?.business_settings && typeof settings.business_settings === 'object'
    ? settings.business_settings as Record<string, unknown>
    : {}
  const regulations = (Array.isArray(business.public_regulations) ? business.public_regulations : []) as PublicEventRegulation[]
  const visible = regulations.filter((item) => item && item.enabled && typeof item.title === 'string' && item.title.trim() && typeof item.content === 'string' && item.content.trim())
    .sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0))
  const eventRules = visible.filter((item) => item.scope === 'EVENT')
  const categoryRules = visible.filter((item) => item.scope === 'CATEGORY' || item.scope === 'STAGE')
  const categoryMap = new Map((categories ?? []).map((category) => [category.id, category.label]))
  const categoryIds = [...new Set(categoryRules.map((item) => item.category_id).filter((id): id is string => Boolean(id)))]

  const RegulationCard = ({ item }: { item: PublicEventRegulation }) => (
    <article key={item.id} className="rounded-2xl border border-[#705547] bg-[#2a160d] p-4 sm:p-5">
      <h3 className="text-lg font-black text-[#fff8e8]">{item.title}</h3>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#eadcca]">{item.content}</p>
      {getSafeDocumentUrl(item.document_url) && <a href={getSafeDocumentUrl(item.document_url)!} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex min-h-11 items-center rounded-full border border-[#f3c63d]/60 px-4 text-sm font-bold text-[#f3c63d] hover:bg-[#f3c63d]/10">Buka dokumen</a>}
    </article>
  )

  return (
    <div className="public-page min-h-screen bg-[#f5ecd7] text-[#1d0d07]">
      <PublicTopbar />
      <main className="mx-auto grid w-full max-w-4xl gap-5 px-4 py-6 pb-28 sm:px-6 md:py-10">
        <header className="rounded-[1.75rem] border border-[#4f372b] bg-[#1d0d07] p-5 text-[#fff8e8] shadow-[0_20px_50px_rgba(55,23,9,0.18)] sm:p-7">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[#f3c63d]">Panduan resmi event</p>
          <h1 className="mt-2 text-2xl font-black sm:text-3xl">Regulasi {event.name}</h1>
          <p className="mt-2 text-sm leading-6 text-[#c9b7a5]">Ketentuan umum, aturan kategori, serta alur setiap stage lomba.</p>
          <Link href={`/event/${eventId}`} className="mt-4 inline-flex min-h-11 items-center rounded-full border border-white/30 px-4 text-sm font-bold text-white hover:bg-white/10">Kembali ke detail event</Link>
        </header>

        {eventRules.length > 0 && <section className="grid gap-3">
          <h2 className="text-xl font-black">Ketentuan Umum Event</h2>
          {eventRules.map((item) => <RegulationCard key={item.id} item={item} />)}
        </section>}

        {categoryIds.map((categoryId) => {
          const entries = categoryRules.filter((item) => item.category_id === categoryId)
          const general = entries.filter((item) => item.scope === 'CATEGORY')
          const stages = entries.filter((item) => item.scope === 'STAGE')
          return (
            <section key={categoryId} className="grid gap-3">
              <h2 className="text-xl font-black">{categoryMap.get(categoryId) ?? 'Kategori'}</h2>
              {general.map((item) => <RegulationCard key={item.id} item={item} />)}
              {stages.map((item) => (
                <div key={item.id} className="grid gap-2 rounded-2xl border border-[#d9c9ae] bg-[#fff8e8] p-4 sm:p-5">
                  <p className="text-xs font-black uppercase tracking-wide text-[#a83b16]">{stageLabels[item.stage ?? ''] ?? 'Stage'}</p>
                  <RegulationCard item={item} />
                </div>
              ))}
            </section>
          )
        })}

        {visible.length === 0 && <section className="rounded-2xl border border-dashed border-[#bca990] bg-[#fff8e8] p-6 text-sm leading-6 text-[#6f5a4a]">Panitia belum menerbitkan regulasi untuk event ini.</section>}
      </main>
    </div>
  )
}
