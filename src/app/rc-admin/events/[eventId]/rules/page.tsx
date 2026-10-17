'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { supabase } from '@/src/lib/supabaseClient'

type Category = { id: string; label: string; enabled: boolean }
type Config = { category_id: string; enabled: boolean; max_riders_per_race: number; qualification_moto_count: number; repechage_max_riders_per_race: number | null; quarter_final_max_riders_per_race: number | null; semi_final_max_riders_per_race: number | null; dnf_point_override: number | null; dns_point_override: number | null }
type Rule = { category_id: string; min_riders: number }
type Draft = Omit<Config, 'category_id'> & { thresholds: string }

const emptyDraft = (): Draft => ({ enabled: false, max_riders_per_race: 8, qualification_moto_count: 2, repechage_max_riders_per_race: null, quarter_final_max_riders_per_race: null, semi_final_max_riders_per_race: null, dnf_point_override: null, dns_point_override: null, thresholds: '' })
const numeric = (value: string) => value.trim() === '' ? null : Number(value)

export default function RcAdminRulesPage() {
  const { eventId } = useParams<{ eventId: string }>()
  const [categories, setCategories] = useState<Category[]>([])
  const [configs, setConfigs] = useState<Config[]>([])
  const [rules, setRules] = useState<Rule[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [draft, setDraft] = useState<Draft>(emptyDraft())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const selectedCategory = categories.find((category) => category.id === selectedId)
  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token
      if (!token) throw new Error('Sesi login berakhir. Silakan login kembali.')
      const response = await fetch(`/api/events/${eventId}/advanced-race`, { headers: { Authorization: `Bearer ${token}` } })
      const json = await response.json()
      if (!response.ok) throw new Error(json.error ?? 'Gagal memuat aturan race.')
      setCategories(json.data.categories ?? []); setConfigs(json.data.configs ?? []); setRules(json.data.rules ?? [])
      setSelectedId((current) => current || json.data.categories?.[0]?.id || '')
    } catch (err) { setError(err instanceof Error ? err.message : 'Gagal memuat aturan race.') }
    finally { setLoading(false) }
  }, [eventId])

  useEffect(() => { void load() }, [load])
  useEffect(() => {
    if (!selectedId) return
    const config = configs.find((item) => item.category_id === selectedId)
    const categoryRules = rules.filter((item) => item.category_id === selectedId).map((item) => item.min_riders).sort((a, b) => a - b)
    setDraft({ ...emptyDraft(), ...config, thresholds: categoryRules.join(', ') })
  }, [selectedId, configs, rules])

  const setField = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((current) => ({ ...current, [key]: value }))
  const save = async () => {
    if (!selectedId) return
    const minRiders = draft.thresholds.split(',').map((value) => Number(value.trim())).filter((value) => Number.isInteger(value) && value > 0)
    if (draft.thresholds.trim() && minRiders.length !== draft.thresholds.split(',').filter((value) => value.trim()).length) {
      setError('Ambang jumlah rider harus berupa angka bulat positif, pisahkan dengan koma.'); return
    }
    setSaving(true); setError(''); setNotice('')
    try {
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token
      if (!token) throw new Error('Sesi login berakhir. Silakan login kembali.')
      const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
      const configResponse = await fetch(`/api/events/${eventId}/advanced-race`, { method: 'POST', headers, body: JSON.stringify({
        category_id: selectedId, enabled: draft.enabled, max_riders_per_race: Number(draft.max_riders_per_race), qualification_moto_count: Number(draft.qualification_moto_count),
        repechage_max_riders_per_race: draft.repechage_max_riders_per_race, quarter_final_max_riders_per_race: draft.quarter_final_max_riders_per_race, semi_final_max_riders_per_race: draft.semi_final_max_riders_per_race,
        dnf_point_override: draft.dnf_point_override, dns_point_override: draft.dns_point_override,
      }) })
      const configJson = await configResponse.json()
      if (!configResponse.ok) throw new Error(configJson.error ?? 'Gagal menyimpan konfigurasi stage.')
      const rulesResponse = await fetch(`/api/events/${eventId}/advanced-race/rules`, { method: 'POST', headers, body: JSON.stringify({ category_id: selectedId, rules: minRiders.map((min_riders) => ({ min_riders })) }) })
      const rulesJson = await rulesResponse.json()
      if (!rulesResponse.ok) throw new Error(rulesJson.error ?? 'Gagal menyimpan ambang stage.')
      setNotice('Aturan kategori tersimpan.'); await load()
    } catch (err) { setError(err instanceof Error ? err.message : 'Gagal menyimpan aturan.') }
    finally { setSaving(false) }
  }

  const numberField = (label: string, key: keyof Draft, min = 1) => <label className="grid gap-1 text-sm font-bold text-slate-700">{label}<input type="number" min={min} value={(draft[key] as number | null) ?? ''} onChange={(event) => setField(key, numeric(event.target.value) as Draft[typeof key])} className="min-h-11 rounded-md border border-slate-300 px-3 font-semibold text-slate-950 focus:border-amber-500 focus:outline-none" /></label>

  return <main className="min-h-screen bg-slate-50 px-4 py-5 text-slate-950 sm:px-6"><div className="mx-auto max-w-5xl">
    <Link href={`/rc-admin/events/${eventId}`} className="text-sm font-bold text-slate-600 hover:text-amber-800">&larr; Kembali ke event</Link>
    <section className="mt-5 rounded-lg border border-slate-200 bg-white p-4 sm:p-6">
      <p className="text-xs font-black uppercase text-amber-800">Setup event</p><h1 className="mt-1 text-2xl font-black">Aturan race</h1>
      {loading ? <p className="mt-5 text-sm text-slate-500">Memuat aturan...</p> : categories.length === 0 ? <p className="mt-5 rounded-md bg-amber-50 p-3 text-sm font-semibold">Buat kategori terlebih dahulu sebelum mengatur aturan race.</p> : <>
        <label className="mt-5 grid max-w-xl gap-1.5 text-sm font-bold">Kategori<select value={selectedId} onChange={(event) => setSelectedId(event.target.value)} className="min-h-11 rounded-md border border-slate-300 bg-white px-3"><option value="">Pilih kategori</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.label}{category.enabled ? '' : ' (nonaktif)'}</option>)}</select></label>
        {selectedCategory && <div className="mt-5 grid gap-4">
          <label className="flex min-h-12 items-center justify-between gap-3 rounded-md border border-slate-200 px-3"><span className="text-sm font-bold">Aktifkan multi-stage untuk kategori ini</span><input type="checkbox" checked={draft.enabled} onChange={(event) => setField('enabled', event.target.checked)} className="h-5 w-5 accent-amber-500" /></label>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{numberField('Maks rider per race', 'max_riders_per_race', 2)}{numberField('Moto kualifikasi', 'qualification_moto_count', 1)}{numberField('Maks rider repechage (opsional)', 'repechage_max_riders_per_race', 2)}{numberField('Maks rider quarter-final (opsional)', 'quarter_final_max_riders_per_race', 2)}{numberField('Maks rider semi-final (opsional)', 'semi_final_max_riders_per_race', 2)}{numberField('Poin DNF (kosong = default)', 'dnf_point_override', 0)}{numberField('Poin DNS (kosong = default)', 'dns_point_override', 0)}</div>
          <label className="grid gap-1.5 text-sm font-bold">Ambang jumlah rider untuk aturan stage<input value={draft.thresholds} onChange={(event) => setField('thresholds', event.target.value)} className="min-h-11 rounded-md border border-slate-300 px-3 font-semibold focus:border-amber-500 focus:outline-none" placeholder="Contoh: 8, 16, 24" /><span className="text-xs font-medium text-slate-500">Angka dipisahkan koma. Sistem menerapkan format stage default sesuai ambang yang dipenuhi.</span></label>
          <p className="text-xs text-slate-500">Stage yang dihasilkan ditentukan oleh aturan default sistem dan jumlah rider. Simpan pengaturan ini sebelum mulai race.</p>
          <button type="button" onClick={save} disabled={saving} className="min-h-11 w-fit rounded-md bg-slate-950 px-5 text-sm font-extrabold text-white hover:bg-slate-800 disabled:opacity-60">{saving ? 'Menyimpan...' : 'Simpan aturan kategori'}</button>
        </div>}
      </>}
      {error && <p role="alert" className="mt-4 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-800">{error}</p>}{notice && <p role="status" className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">{notice}</p>}
    </section>
  </div></main>
}
