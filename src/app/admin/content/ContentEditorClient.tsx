'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import InsightBlocks from '@/src/components/InsightBlocks'
import InsightMarkdown from '@/src/components/InsightMarkdown'
import { useApiFetch } from '@/src/hooks/useApiFetch'
import {
  createDefaultInsightBlocks,
  createEmptyInstagramPackage,
  normalizeContentBlocks,
  type ContentStudioInstagramPackage,
  type InsightContentBlock,
} from '@/src/lib/contentStudio'
import { INSIGHT_CATEGORIES, type InsightCategory } from '@/src/lib/insightCategories'
import type { ContentGenerationDraft, ContentGenerationRequest } from '@/src/lib/contentGeneration'

type StudioTab = 'INSIGHT' | 'INSTAGRAM' | 'SEO'
type SaveAction = 'DRAFT' | 'PUBLISH'

type EditableInsight = {
  title: string
  slug: string
  excerpt: string
  category: InsightCategory
  author_name: string
  cover_image_url: string
  cover_image_alt: string
  content_markdown: string
  content_blocks: InsightContentBlock[]
  seo_title: string
  seo_description: string
  canonical_url: string
  status: 'DRAFT' | 'PUBLISHED'
  published_at: string | null
}

const emptyInsight = (): EditableInsight => ({
  title: '',
  slug: '',
  excerpt: '',
  category: 'RACE_KNOWLEDGE',
  author_name: 'RacePushbike Team',
  cover_image_url: '',
  cover_image_alt: '',
  content_markdown: '',
  content_blocks: createDefaultInsightBlocks(),
  seo_title: '',
  seo_description: '',
  canonical_url: '',
  status: 'DRAFT',
  published_at: null,
})

const blockLabel: Record<InsightContentBlock['type'], string> = {
  heading: 'Heading',
  paragraph: 'Paragraph',
  image: 'Image',
  bullet_list: 'Bullet List',
  numbered_list: 'Numbered List',
  callout: 'Callout',
  table: 'Table',
  quote: 'Quote',
  divider: 'Divider',
}

const blockFactory = (type: InsightContentBlock['type']): InsightContentBlock => {
  const id = `block-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  if (type === 'heading') return { id, type, level: 2, content: '' }
  if (type === 'paragraph' || type === 'quote') return { id, type, content: '' }
  if (type === 'image') return { id, type, url: '', alt: '' }
  if (type === 'bullet_list' || type === 'numbered_list') return { id, type, items: [''] }
  if (type === 'callout') return { id, type, variant: 'NOTE', content: '' }
  if (type === 'table') return { id, type, headers: ['Kolom 1', 'Kolom 2'], rows: [['', '']] }
  return { id, type: 'divider' }
}

const slugify = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 160)

const toError = (cause: unknown) => cause instanceof Error ? cause.message : 'Terjadi kendala saat menyimpan konten.'

function BlockEditor({
  block,
  index,
  total,
  onChange,
  onMove,
  onRemove,
  onUpload,
}: {
  block: InsightContentBlock
  index: number
  total: number
  onChange: (next: InsightContentBlock) => void
  onMove: (direction: -1 | 1) => void
  onRemove: () => void
  onUpload: (file: File, setUrl: (url: string) => void) => void
}) {
  const inputClass = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-200'
  const areaClass = `${inputClass} min-h-[110px] resize-y leading-6`
  const mutate = (patch: Partial<InsightContentBlock>) => onChange({ ...block, ...patch } as InsightContentBlock)

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2">
          <span className="admin-tone-badge admin-tone-neutral">{blockLabel[block.type]}</span>
          <span className="text-xs font-bold text-slate-400">Block {index + 1}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={index === 0} onClick={() => onMove(-1)} className="admin-outline-button disabled:cursor-not-allowed disabled:opacity-40">Move Up</button>
          <button type="button" disabled={index === total - 1} onClick={() => onMove(1)} className="admin-outline-button disabled:cursor-not-allowed disabled:opacity-40">Move Down</button>
          <button type="button" onClick={onRemove} className="admin-danger-button">Hapus</button>
        </div>
      </header>

      <div className="mt-4">
        {block.type === 'heading' ? (
          <div className="grid gap-3 sm:grid-cols-[130px_minmax(0,1fr)]">
            <select className={inputClass} value={block.level} onChange={(event) => mutate({ level: Number(event.target.value) === 3 ? 3 : 2 })}>
              <option value={2}>Heading 2</option><option value={3}>Heading 3</option>
            </select>
            <input className={inputClass} value={block.content} onChange={(event) => mutate({ content: event.target.value })} placeholder="Judul section" />
          </div>
        ) : null}
        {block.type === 'paragraph' || block.type === 'quote' ? (
          <textarea className={areaClass} value={block.content} onChange={(event) => mutate({ content: event.target.value })} placeholder={block.type === 'quote' ? 'Isi kutipan' : 'Tulis isi artikel'} />
        ) : null}
        {block.type === 'image' ? (
          <div className="grid gap-3">
            <input className={inputClass} value={block.url} onChange={(event) => mutate({ url: event.target.value })} placeholder="URL gambar" />
            <div className="flex flex-wrap items-center gap-3">
              <label className="admin-outline-button cursor-pointer">Upload gambar<input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) onUpload(file, (url) => mutate({ url })) }} /></label>
              <span className="text-xs font-semibold text-slate-500">JPG, PNG, atau WebP. Maks. 10 MB.</span>
            </div>
            <input className={inputClass} value={block.alt} onChange={(event) => mutate({ alt: event.target.value })} placeholder="Alt text gambar" />
          </div>
        ) : null}
        {block.type === 'bullet_list' || block.type === 'numbered_list' ? (
          <div className="grid gap-2">
            {block.items.map((item, itemIndex) => (
              <div key={`${block.id}-${itemIndex}`} className="flex gap-2">
                <span className="flex w-7 shrink-0 items-center justify-center text-xs font-black text-slate-500">{block.type === 'numbered_list' ? itemIndex + 1 : '•'}</span>
                <input className={inputClass} value={item} onChange={(event) => mutate({ items: block.items.map((value, index) => index === itemIndex ? event.target.value : value) })} placeholder="Item daftar" />
                <button type="button" onClick={() => mutate({ items: block.items.filter((_, index) => index !== itemIndex) })} className="admin-danger-button">Hapus</button>
              </div>
            ))}
            <button type="button" onClick={() => mutate({ items: [...block.items, ''] })} className="admin-outline-button w-fit">+ Tambah Item</button>
          </div>
        ) : null}
        {block.type === 'callout' ? (
          <div className="grid gap-3">
            <select className={`${inputClass} max-w-[220px]`} value={block.variant} onChange={(event) => mutate({ variant: event.target.value as 'NOTE' | 'IMPORTANT' | 'EXAMPLE' })}>
              <option value="NOTE">Note</option><option value="IMPORTANT">Important</option><option value="EXAMPLE">Example</option>
            </select>
            <textarea className={areaClass} value={block.content} onChange={(event) => mutate({ content: event.target.value })} placeholder="Isi callout" />
          </div>
        ) : null}
        {block.type === 'table' ? (
          <div className="overflow-x-auto">
            <table className="min-w-[620px] w-full border-collapse text-sm">
              <thead><tr>{block.headers.map((header, headerIndex) => <th key={`${block.id}-h-${headerIndex}`} className="border border-slate-200 bg-slate-50 p-2"><input className={inputClass} value={header} onChange={(event) => mutate({ headers: block.headers.map((value, index) => index === headerIndex ? event.target.value : value) })} /></th>)}<th className="border border-slate-200 p-2"><button type="button" onClick={() => mutate({ headers: [...block.headers, `Kolom ${block.headers.length + 1}`], rows: block.rows.map((row) => [...row, '']) })} className="admin-outline-button">+ Kolom</button></th></tr></thead>
              <tbody>{block.rows.map((row, rowIndex) => <tr key={`${block.id}-r-${rowIndex}`}>{block.headers.map((_, cellIndex) => <td key={`${block.id}-${rowIndex}-${cellIndex}`} className="border border-slate-200 p-2"><input className={inputClass} value={row[cellIndex] ?? ''} onChange={(event) => mutate({ rows: block.rows.map((currentRow, index) => index === rowIndex ? currentRow.map((cell, currentCellIndex) => currentCellIndex === cellIndex ? event.target.value : cell) : currentRow) })} /></td>)}<td className="border border-slate-200 p-2"><button type="button" onClick={() => mutate({ rows: block.rows.filter((_, index) => index !== rowIndex) })} className="admin-danger-button">Hapus</button></td></tr>)}</tbody>
            </table>
            <button type="button" onClick={() => mutate({ rows: [...block.rows, block.headers.map(() => '')] })} className="admin-outline-button mt-3">+ Tambah Baris</button>
          </div>
        ) : null}
        {block.type === 'divider' ? <p className="text-sm font-semibold text-slate-500">Pemisah visual akan ditampilkan sebagai garis horizontal pada artikel.</p> : null}
      </div>
    </article>
  )
}

export default function ContentEditorClient({ contentId }: { contentId?: string }) {
  const apiFetch = useApiFetch()
  const router = useRouter()
  const [activeId, setActiveId] = useState(contentId ?? null)
  const [tab, setTab] = useState<StudioTab>('INSIGHT')
  const [topic, setTopic] = useState('')
  const [insight, setInsight] = useState<EditableInsight>(emptyInsight)
  const [instagram, setInstagram] = useState<ContentStudioInstagramPackage>(createEmptyInstagramPackage)
  const [loading, setLoading] = useState(Boolean(contentId))
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [preview, setPreview] = useState(false)
  const [aiAudience, setAiAudience] = useState<ContentGenerationRequest['audience']>('PARENTS')
  const [aiTone, setAiTone] = useState<ContentGenerationRequest['tone']>('CLEAR')
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const touch = () => setDirty(true)
  const updateInsight = (patch: Partial<EditableInsight>) => { setInsight((value) => ({ ...value, ...patch })); touch() }

  const load = useCallback(async (id: string) => {
    setLoading(true)
    setFeedback(null)
    try {
      const json = await apiFetch(`/api/admin/content/${id}`)
      const data = json.data
      setTopic(data.item.topic || '')
      setInsight({
        title: data.insight.title || '', slug: data.insight.slug?.startsWith('draft-') ? '' : data.insight.slug || '', excerpt: data.insight.excerpt || '',
        category: data.insight.category || 'RACE_KNOWLEDGE', author_name: data.insight.author_name || 'RacePushbike Team',
        cover_image_url: data.insight.cover_image_url || '', cover_image_alt: data.insight.cover_image_alt || '', content_markdown: data.insight.content_markdown || '',
        content_blocks: data.insight.content_blocks?.length ? normalizeContentBlocks(data.insight.content_blocks) : createDefaultInsightBlocks(),
        seo_title: data.insight.seo_title || '', seo_description: data.insight.seo_description || '', canonical_url: data.insight.canonical_url || '',
        status: data.insight.status || 'DRAFT', published_at: data.insight.published_at || null,
      })
      setInstagram(data.instagram || createEmptyInstagramPackage())
      setDirty(false)
    } catch (cause) {
      setFeedback({ type: 'error', message: toError(cause) })
    } finally {
      setLoading(false)
    }
  }, [apiFetch])

  useEffect(() => { if (activeId) void load(activeId) }, [activeId, load])
  useEffect(() => { const warn = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = '' } }; window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn) }, [dirty])

  const upload = async (file: File, placement: 'cover' | 'article', onComplete: (url: string) => void) => {
    setUploading(true); setFeedback(null)
    try {
      const formData = new FormData(); formData.append('file', file); formData.append('placement', placement)
      const json = await apiFetch('/api/admin/content/upload', { method: 'POST', body: formData })
      onComplete(json.data.url); touch(); setFeedback({ type: 'success', message: 'Gambar berhasil diunggah.' })
    } catch (cause) { setFeedback({ type: 'error', message: toError(cause) }) } finally { setUploading(false) }
  }

  const save = async (action: SaveAction) => {
    setSaving(true); setFeedback(null)
    try {
      let id = activeId
      if (!id) {
        const created = await apiFetch('/api/admin/content', { method: 'POST', body: JSON.stringify({ topic: topic || insight.title || 'Konten Baru' }) })
        id = created.data.id as string; setActiveId(id)
      }
      const json = await apiFetch(`/api/admin/content/${id}`, { method: 'PUT', body: JSON.stringify({ action, topic, insight, instagram }) })
      setInsight((value) => ({ ...value, status: json.data.status, published_at: json.data.insight.published_at || value.published_at }))
      setDirty(false)
      setFeedback({ type: 'success', message: action === 'PUBLISH' ? 'Insight berhasil dipublish.' : 'Draft berhasil disimpan.' })
      if (!activeId) router.replace(`/admin/content/${id}`)
    } catch (cause) { setFeedback({ type: 'error', message: toError(cause) }) } finally { setSaving(false) }
  }

  const generateDraft = async () => {
    const requestedTopic = (topic || insight.title).trim()
    if (!requestedTopic) {
      setFeedback({ type: 'error', message: 'Isi Topic atau Title terlebih dahulu sebelum membuat draf AI.' })
      return
    }
    const hasCurrentDraft = Boolean(
      insight.title ||
      insight.excerpt ||
      insight.content_blocks.some((block) => {
        if (block.type === 'paragraph' || block.type === 'heading' || block.type === 'quote' || block.type === 'callout') return Boolean(block.content.trim())
        if (block.type === 'bullet_list' || block.type === 'numbered_list') return block.items.some(Boolean)
        if (block.type === 'image') return Boolean(block.url)
        if (block.type === 'table') return block.headers.some(Boolean) || block.rows.some((row) => row.some(Boolean))
        return false
      })
    )
    if (hasCurrentDraft && !window.confirm('Draf AI akan mengganti isi artikel dan paket Instagram di layar ini. Perubahan sebelumnya yang belum disimpan akan hilang. Lanjutkan?')) return

    setGenerating(true)
    setFeedback(null)
    try {
      const json = await apiFetch('/api/admin/content/generate', {
        method: 'POST',
        body: JSON.stringify({ topic: requestedTopic, audience: aiAudience, tone: aiTone }),
      })
      const draft = json.data as ContentGenerationDraft
      setTopic(draft.topic)
      setInsight((current) => ({
        ...current,
        ...draft.insight,
        content_markdown: '',
        status: current.status,
        published_at: current.published_at,
      }))
      setInstagram(draft.instagram)
      setTab('INSIGHT')
      setDirty(true)
      setFeedback({ type: 'success', message: 'Draf AI siap ditinjau. Belum disimpan dan belum dipublish.' })
    } catch (cause) {
      setFeedback({ type: 'error', message: toError(cause) })
    } finally {
      setGenerating(false)
    }
  }

  const updateBlock = (index: number, block: InsightContentBlock) => updateInsight({ content_blocks: insight.content_blocks.map((value, itemIndex) => itemIndex === index ? block : value) })
  const moveBlock = (index: number, direction: -1 | 1) => {
    const target = index + direction; if (target < 0 || target >= insight.content_blocks.length) return
    const next = [...insight.content_blocks]; [next[index], next[target]] = [next[target], next[index]]; updateInsight({ content_blocks: next })
  }
  const previewBlocks = normalizeContentBlocks(insight.content_blocks)
  const canonicalPreview = insight.canonical_url || (insight.slug ? `https://racepushbike.com/insight/${insight.slug}` : 'https://racepushbike.com/insight/slug-artikel')

  if (loading) return <main className="admin-page-shell"><div className="admin-surface p-8"><div className="admin-skeleton h-9 w-64" /><div className="admin-skeleton mt-6 h-80" /></div></main>

  return (
    <main className="admin-page-shell">
      <section className="admin-surface px-6 py-6 lg:px-8">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <Link href="/admin/content" className="text-xs font-extrabold uppercase tracking-[0.14em] text-slate-500 hover:text-slate-900">&larr; Content Studio</Link>
            <div className="mt-3 flex flex-wrap items-center gap-3"><h1 className="admin-heading text-3xl">{topic || insight.title || 'Konten Baru'}</h1><span className={`admin-tone-badge ${insight.status === 'PUBLISHED' ? 'admin-tone-success' : 'admin-tone-neutral'}`}>{insight.status}</span>{dirty ? <span className="text-xs font-bold text-amber-700">Unsaved changes</span> : null}</div>
            <p className="admin-muted mt-2 text-sm">Satu topik untuk artikel Insight dan paket Instagram.</p>
          </div>
          <div className="flex flex-wrap gap-2"><button type="button" onClick={() => void generateDraft()} disabled={generating || saving} className="admin-outline-button disabled:opacity-60">{generating ? 'Menulis draf AI...' : 'Buat Draft AI'}</button><button type="button" onClick={() => setPreview((value) => !value)} className="admin-outline-button">{preview ? 'Tutup Preview' : 'Preview'}</button><button type="button" disabled={saving || generating} onClick={() => void save('DRAFT')} className="admin-outline-button disabled:opacity-60">{saving ? 'Menyimpan...' : 'Save Draft'}</button><button type="button" disabled={saving || generating} onClick={() => void save('PUBLISH')} className="admin-primary-button disabled:opacity-60">Publish</button></div>
        </div>
      </section>

      {feedback ? <div className={`mt-5 ${feedback.type === 'error' ? 'admin-alert-danger' : 'admin-alert-success'}`}>{feedback.message}</div> : null}
      {uploading ? <div className="admin-alert-info mt-5">Mengunggah gambar...</div> : null}
      {generating ? <div className="admin-alert-info mt-5">AI sedang menulis artikel, carousel, caption, dan SEO. Tunggu sebentar.</div> : null}

      <section className="admin-surface mt-5 p-5 lg:p-6">
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
          <label className="block max-w-3xl"><span className="admin-kicker">Topic</span><input value={topic} onChange={(event) => { setTopic(event.target.value); touch() }} placeholder="Contoh: DNS vs DNF dalam Race Pushbike" className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-lg font-bold text-slate-900 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-200" /></label>
          <div className="grid gap-2 sm:grid-cols-2 xl:w-[390px]">
            <label><span className="admin-field-label">Audience AI</span><select value={aiAudience} onChange={(event) => setAiAudience(event.target.value as ContentGenerationRequest['audience'])} className="admin-field-input"><option value="PARENTS">Wali rider</option><option value="ORGANIZERS">Panitia</option><option value="COMMUNITY">Komunitas</option></select></label>
            <label><span className="admin-field-label">Gaya bahasa</span><select value={aiTone} onChange={(event) => setAiTone(event.target.value as ContentGenerationRequest['tone'])} className="admin-field-input"><option value="CLEAR">Jelas</option><option value="FRIENDLY">Hangat</option><option value="FORMAL">Formal</option></select></label>
          </div>
        </div>
        <p className="mt-3 text-xs font-semibold leading-5 text-slate-500">AI hanya membuat draf yang perlu direview. Ia tidak mengakses data event, tidak membuat gambar, dan tidak akan publish otomatis.</p>
        <div className="mt-6 flex flex-wrap gap-2 border-b border-slate-200 pb-0">
          {(['INSIGHT', 'INSTAGRAM', 'SEO'] as StudioTab[]).map((item) => <button key={item} type="button" onClick={() => setTab(item)} className={tab === item ? 'admin-tab-button admin-tab-button-active' : 'admin-tab-button'}>{item === 'INSIGHT' ? 'Insight' : item === 'INSTAGRAM' ? 'Instagram' : 'SEO'}</button>)}
        </div>

        {tab === 'INSIGHT' ? <section className="mt-6 grid gap-7 xl:grid-cols-[minmax(0,1fr)_330px]">
          <div className="grid gap-5">
            <div className="grid gap-4 md:grid-cols-2"><label><span className="admin-field-label">Title</span><input value={insight.title} onChange={(event) => updateInsight({ title: event.target.value })} className="admin-field-input" placeholder="Judul artikel" /></label><label><span className="admin-field-label">Category</span><select value={insight.category} onChange={(event) => updateInsight({ category: event.target.value as InsightCategory })} className="admin-field-input">{INSIGHT_CATEGORIES.map((category) => <option key={category.value} value={category.value}>{category.label}</option>)}</select></label></div>
            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto]"><label><span className="admin-field-label">Slug</span><input value={insight.slug} onChange={(event) => updateInsight({ slug: event.target.value.toLowerCase() })} className="admin-field-input" placeholder="dns-vs-dnf-race-pushbike" /></label><button type="button" onClick={() => updateInsight({ slug: slugify(insight.title) })} className="admin-outline-button self-end">Buat dari judul</button></div>
            <label><span className="admin-field-label">Excerpt</span><textarea value={insight.excerpt} onChange={(event) => updateInsight({ excerpt: event.target.value })} className="admin-field-input min-h-[96px] resize-y" placeholder="Ringkasan singkat yang tampil di kartu artikel." /><span className="mt-1 block text-xs font-semibold text-slate-500">{insight.excerpt.length}/640</span></label>
            <div className="grid gap-4 md:grid-cols-2"><label><span className="admin-field-label">Author</span><input value={insight.author_name} onChange={(event) => updateInsight({ author_name: event.target.value })} className="admin-field-input" /></label><label><span className="admin-field-label">Cover image alt</span><input value={insight.cover_image_alt} onChange={(event) => updateInsight({ cover_image_alt: event.target.value })} className="admin-field-input" placeholder="Deskripsikan gambar cover" /></label></div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><span className="admin-field-label">Cover Image</span><p className="mt-1 text-xs font-semibold text-slate-500">Gunakan gambar landscape agar kartu artikel lebih rapi.</p></div><label className="admin-outline-button cursor-pointer">Upload Cover<input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file, 'cover', (url) => updateInsight({ cover_image_url: url })) }} /></label></div><input value={insight.cover_image_url} onChange={(event) => updateInsight({ cover_image_url: event.target.value })} className="admin-field-input mt-3" placeholder="https://..." />{insight.cover_image_url ? <img src={insight.cover_image_url} alt={insight.cover_image_alt || ''} className="mt-3 h-40 w-full rounded-lg border border-slate-200 object-cover" /> : null}</div>
            <div><div className="flex flex-wrap items-end justify-between gap-3"><div><span className="admin-field-label">Article Content</span><p className="mt-1 text-sm font-semibold text-slate-600">Susun artikel dengan block. HTML bebas tidak disimpan atau dirender.</p></div><div className="flex flex-wrap gap-2">{(Object.keys(blockLabel) as InsightContentBlock['type'][]).map((type) => <button key={type} type="button" onClick={() => updateInsight({ content_blocks: [...insight.content_blocks, blockFactory(type)] })} className="admin-outline-button">+ {blockLabel[type]}</button>)}</div></div><div className="mt-4 grid gap-3">{insight.content_blocks.map((block, index) => <BlockEditor key={block.id} block={block} index={index} total={insight.content_blocks.length} onChange={(next) => updateBlock(index, next)} onMove={(direction) => moveBlock(index, direction)} onRemove={() => updateInsight({ content_blocks: insight.content_blocks.filter((_, itemIndex) => itemIndex !== index) })} onUpload={(file, complete) => void upload(file, 'article', complete)} />)}</div></div>
          </div>
          <aside className="h-fit rounded-lg border border-amber-200 bg-amber-50 p-5"><strong className="admin-heading block text-base">Publish checklist</strong><ul className="mt-3 grid gap-2 text-sm font-semibold text-slate-700"><li>{insight.title ? '✓' : '○'} Title</li><li>{insight.slug ? '✓' : '○'} Slug</li><li>{insight.excerpt ? '✓' : '○'} Excerpt</li><li>{insight.category ? '✓' : '○'} Category</li><li>{previewBlocks.some((block) => block.type !== 'divider') || insight.content_markdown ? '✓' : '○'} Article content</li></ul><p className="mt-4 text-xs font-semibold leading-5 text-slate-600">Instagram tidak wajib selesai agar artikel Insight dapat dipublish.</p></aside>
        </section> : null}

        {tab === 'INSTAGRAM' ? <section className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]"><div className="grid gap-5"><div className="grid gap-4 md:grid-cols-2"><label><span className="admin-field-label">Instagram Post Type</span><select value={instagram.post_type} onChange={(event) => { setInstagram((value) => ({ ...value, post_type: event.target.value as ContentStudioInstagramPackage['post_type'] })); touch() }} className="admin-field-input"><option value="CAROUSEL">Carousel</option><option value="REEL">Reel</option><option value="SINGLE_IMAGE">Single Image</option></select></label><label><span className="admin-field-label">Social Status</span><select value={instagram.social_status} onChange={(event) => { setInstagram((value) => ({ ...value, social_status: event.target.value as ContentStudioInstagramPackage['social_status'] })); touch() }} className="admin-field-input"><option value="NOT_READY">Not Ready</option><option value="READY">Ready</option><option value="POSTED">Posted</option></select></label></div>
          {instagram.post_type === 'CAROUSEL' ? <div className="rounded-lg border border-slate-200 p-4"><div className="flex items-center justify-between gap-3"><div><span className="admin-field-label">Carousel Slides</span><p className="mt-1 text-xs font-semibold text-slate-500">Susun copy tiap slide. Asset visual dapat dicatat pada Notes untuk Phase 2.</p></div><button type="button" onClick={() => { setInstagram((value) => ({ ...value, slides: [...value.slides, { id: `slide-${Date.now()}`, headline: '', body: '' }] })); touch() }} className="admin-primary-button">+ Tambah Slide</button></div><div className="mt-4 grid gap-3">{instagram.slides.map((slide, index) => <article key={slide.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4"><div className="flex justify-between gap-3"><strong className="text-sm text-slate-800">Slide {index + 1}</strong><div className="flex gap-2"><button type="button" disabled={index === 0} onClick={() => { setInstagram((value) => { const slides = [...value.slides]; [slides[index - 1], slides[index]] = [slides[index], slides[index - 1]]; return { ...value, slides } }); touch() }} className="admin-outline-button disabled:opacity-40">Up</button><button type="button" disabled={index === instagram.slides.length - 1} onClick={() => { setInstagram((value) => { const slides = [...value.slides]; [slides[index + 1], slides[index]] = [slides[index], slides[index + 1]]; return { ...value, slides } }); touch() }} className="admin-outline-button disabled:opacity-40">Down</button><button type="button" onClick={() => { setInstagram((value) => ({ ...value, slides: value.slides.filter((_, itemIndex) => itemIndex !== index) })); touch() }} className="admin-danger-button">Hapus</button></div></div><div className="mt-3 grid gap-3"><input value={slide.headline} onChange={(event) => { setInstagram((value) => ({ ...value, slides: value.slides.map((item, itemIndex) => itemIndex === index ? { ...item, headline: event.target.value } : item) })); touch() }} className="admin-field-input" placeholder="Headline" /><textarea value={slide.body} onChange={(event) => { setInstagram((value) => ({ ...value, slides: value.slides.map((item, itemIndex) => itemIndex === index ? { ...item, body: event.target.value } : item) })); touch() }} className="admin-field-input min-h-[96px] resize-y" placeholder="Body slide" /></div></article>)}</div></div> : <div className="rounded-lg border border-dashed border-slate-300 p-5 text-sm font-semibold text-slate-600">Slide tidak diperlukan untuk {instagram.post_type === 'REEL' ? 'Reel' : 'Single Image'}. Simpan hook, caption, CTA, hashtag, dan catatan produksi di bawah.</div>}
          <label><span className="admin-field-label">Caption</span><textarea value={instagram.caption} onChange={(event) => { setInstagram((value) => ({ ...value, caption: event.target.value })); touch() }} className="admin-field-input min-h-[150px] resize-y" placeholder="Caption Instagram" /></label><div className="grid gap-4 md:grid-cols-2"><label><span className="admin-field-label">CTA</span><input value={instagram.cta} onChange={(event) => { setInstagram((value) => ({ ...value, cta: event.target.value })); touch() }} className="admin-field-input" placeholder="Contoh: Simpan artikel ini" /></label><label><span className="admin-field-label">Hashtags</span><input value={instagram.hashtags} onChange={(event) => { setInstagram((value) => ({ ...value, hashtags: event.target.value })); touch() }} className="admin-field-input" placeholder="#racepushbike #pushbike" /></label></div><label><span className="admin-field-label">Notes</span><textarea value={instagram.notes} onChange={(event) => { setInstagram((value) => ({ ...value, notes: event.target.value })); touch() }} className="admin-field-input min-h-[110px] resize-y" placeholder="Arahan visual, asset yang dibutuhkan, atau catatan editor." /></label></div>
          <aside className="h-fit rounded-lg border border-slate-200 bg-slate-50 p-5"><div className="admin-kicker">Satu Topik</div><strong className="admin-heading mt-2 block text-xl">{topic || insight.title || 'Konten Baru'}</strong><div className="mt-5 grid gap-3 text-sm font-semibold"><p>Insight: <span className={insight.status === 'PUBLISHED' ? 'text-emerald-700' : 'text-slate-500'}>{insight.status}</span></p><p>Instagram: <span className="text-slate-700">{instagram.social_status.replace('_', ' ')}</span></p><p>Slides: {instagram.slides.length}</p></div></aside>
        </section> : null}

        {tab === 'SEO' ? <section className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]"><div className="grid gap-5"><label><span className="admin-field-label">SEO Title</span><input value={insight.seo_title} onChange={(event) => updateInsight({ seo_title: event.target.value })} className="admin-field-input" placeholder={insight.title || 'Akan memakai title artikel'} /><span className="mt-1 block text-xs font-semibold text-slate-500">{insight.seo_title.length}/60 sebagai panduan, bukan batas mutlak.</span></label><label><span className="admin-field-label">Meta Description</span><textarea value={insight.seo_description} onChange={(event) => updateInsight({ seo_description: event.target.value })} className="admin-field-input min-h-[110px] resize-y" placeholder={insight.excerpt || 'Akan memakai excerpt artikel'} /><span className="mt-1 block text-xs font-semibold text-slate-500">{insight.seo_description.length}/160 sebagai panduan, bukan batas mutlak.</span></label><label><span className="admin-field-label">Canonical URL</span><input value={insight.canonical_url} onChange={(event) => updateInsight({ canonical_url: event.target.value })} className="admin-field-input" placeholder={`https://racepushbike.com/insight/${insight.slug || 'slug-artikel'}`} /><span className="mt-1 block text-xs font-semibold text-slate-500">Kosongkan untuk memakai URL Insight bawaan.</span></label></div><aside className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"><div className="admin-kicker">Google Search Preview</div><p className="mt-4 truncate text-sm text-emerald-700">{canonicalPreview}</p><h2 className="mt-1 text-xl font-medium leading-snug text-[#1a0dab]">{insight.seo_title || insight.title || 'Judul artikel Insight'}</h2><p className="mt-2 text-sm leading-6 text-slate-600">{insight.seo_description || insight.excerpt || 'Meta description akan tampil di sini saat tersedia.'}</p></aside></section> : null}
      </section>

      {preview ? <section className="admin-surface mt-5 overflow-hidden"><div className="border-b border-slate-200 px-6 py-4"><div className="admin-kicker">Draft Preview</div><strong className="admin-heading mt-1 block text-xl">{insight.title || 'Judul artikel Insight'}</strong></div><article className="mx-auto max-w-3xl px-6 py-8"><p className="text-xs font-black uppercase tracking-[0.14em] text-[#e84b16]">{INSIGHT_CATEGORIES.find((category) => category.value === insight.category)?.label}</p><h2 className="mt-3 font-[var(--font-display)] text-5xl leading-none text-[#1d0d07]">{insight.title || 'Judul artikel Insight'}</h2><p className="mt-3 text-sm font-semibold text-slate-500">{insight.author_name || 'RacePushbike Team'}</p>{previewBlocks.length > 0 ? <InsightBlocks blocks={previewBlocks} /> : insight.content_markdown ? <InsightMarkdown content={insight.content_markdown} /> : <p className="mt-8 text-slate-500">Mulai tambahkan block untuk melihat preview artikel.</p>}</article></section> : null}
    </main>
  )
}
