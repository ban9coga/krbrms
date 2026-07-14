'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '../../../../lib/supabaseClient'

// ─── Types ──────────────────────────────────────────────────────────────────

type Category = {
  id: string
  name: string
}

type RiderRow = {
  rider_id: string
  rider_name: string
  rider_nickname?: string | null
  plate: string
  club?: string | null
  gate_position?: number | null
  status: 'READY' | 'ABSENT' | 'DNS' | 'PENDING'
}

type DrawResult = {
  id: string
  timestamp: string
  raceNum: number
  moto: number
  riderId?: string
  riderName?: string
  plate?: string
  gate?: number
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const apiFetch = async (url: string, options: RequestInit = {}) => {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(url, { ...options, headers })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json?.error || 'Request failed')
  return json
}

const padTime = (n: number) => String(n).padStart(2, '0')
const nowTimeStr = () => {
  const d = new Date()
  return `${padTime(d.getHours())}:${padTime(d.getMinutes())}:${padTime(d.getSeconds())}`
}

// ─── Audio ───────────────────────────────────────────────────────────────────

function useDrawAudio() {
  const ctxRef = useRef<AudioContext | null>(null)
  const spinIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const ctx = () => {
    if (!ctxRef.current) ctxRef.current = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
    if (ctxRef.current.state === 'suspended') ctxRef.current.resume()
    return ctxRef.current
  }

  const playClick = useCallback(() => {
    const ac = ctx()
    const osc = ac.createOscillator()
    const gain = ac.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(800, ac.currentTime)
    osc.frequency.exponentialRampToValueAtTime(0.01, ac.currentTime + 0.1)
    gain.gain.setValueAtTime(0.1, ac.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.01, ac.currentTime + 0.1)
    osc.connect(gain); gain.connect(ac.destination)
    osc.start(); osc.stop(ac.currentTime + 0.1)
  }, [])

  const startSpinSound = useCallback(() => {
    let freq = 150
    spinIntervalRef.current = setInterval(() => {
      const ac = ctx()
      const osc = ac.createOscillator()
      const gain = ac.createGain()
      osc.type = 'square'
      osc.frequency.setValueAtTime(freq, ac.currentTime)
      gain.gain.setValueAtTime(0.05, ac.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.01, ac.currentTime + 0.05)
      osc.connect(gain); gain.connect(ac.destination)
      osc.start(); osc.stop(ac.currentTime + 0.05)
      freq = freq > 400 ? 150 : freq + 20
    }, 80)
  }, [])

  const stopSpinSound = useCallback(() => {
    if (spinIntervalRef.current) clearInterval(spinIntervalRef.current)
  }, [])

  const playVictory = useCallback(() => {
    const ac = ctx()
    const gain = ac.createGain()
    gain.gain.setValueAtTime(0.1, ac.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.01, ac.currentTime + 1)
    gain.connect(ac.destination)
    const freqs = [[261.63, 329.63], [523.25, 659.25]]
    const types: OscillatorType[] = ['triangle', 'sawtooth']
    types.forEach((type, i) => {
      const osc = ac.createOscillator()
      osc.type = type
      osc.frequency.setValueAtTime(freqs[0][i], ac.currentTime)
      osc.frequency.exponentialRampToValueAtTime(freqs[1][i], ac.currentTime + 0.5)
      osc.connect(gain)
      osc.start(); osc.stop(ac.currentTime + 1)
    })
  }, [])

  return { playClick, startSpinSound, stopSpinSound, playVictory }
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function McDrawPage() {
  const params = useParams()
  const eventId = String(params?.eventId ?? '')

  const [categories, setCategories] = useState<Category[]>([])
  const [selectedCategoryId, setSelectedCategoryId] = useState('')
  const [riders, setRiders] = useState<RiderRow[]>([])
  const [maxPerBatch, setMaxPerBatch] = useState(8)
  const [isSpinning, setIsSpinning] = useState(false)
  const [wheelRotation, setWheelRotation] = useState(0)
  const [results, setResults] = useState<DrawResult[]>([])
  const [victoryPulse, setVictoryPulse] = useState(false)
  const [confettiItems, setConfettiItems] = useState<{ id: number; x: number; y: number; color: string }[]>([])
  const [loadingCats, setLoadingCats] = useState(false)
  const [loadingRiders, setLoadingRiders] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { playClick, startSpinSound, stopSpinSound, playVictory } = useDrawAudio()
  const wheelRef = useRef<HTMLDivElement>(null)
  const confettiCounterRef = useRef(0)

  // Load categories
  useEffect(() => {
    if (!eventId) return
    setLoadingCats(true)
    apiFetch(`/api/internal/mc/events/${eventId}/categories`)
      .then((json) => setCategories((json.data ?? []) as Category[]))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Gagal memuat kategori'))
      .finally(() => setLoadingCats(false))
  }, [eventId])

  // Load riders when category changes
  useEffect(() => {
    if (!selectedCategoryId) { setRiders([]); return }
    setLoadingRiders(true)
    apiFetch(`/api/internal/mc/events/${eventId}/categories/${selectedCategoryId}/riders`)
      .then((json) => setRiders((json.data ?? []) as RiderRow[]))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Gagal memuat rider'))
      .finally(() => setLoadingRiders(false))
  }, [eventId, selectedCategoryId])

  const triggerConfetti = () => {
    const items = Array.from({ length: 50 }, () => {
      confettiCounterRef.current++
      return {
        id: confettiCounterRef.current,
        x: Math.random() * 100,
        y: Math.random() * 100,
        color: Math.random() > 0.5 ? '#ff0000' : '#e9c400',
      }
    })
    setConfettiItems(items)
    setTimeout(() => setConfettiItems([]), 1500)
  }

  const handleSpin = () => {
    if (isSpinning) return
    playClick()
    setIsSpinning(true)

    // Animate wheel
    let deg = wheelRotation
    let speed = 20
    const spinInterval = setInterval(() => {
      deg += speed
      setWheelRotation(deg)
    }, 16)

    startSpinSound()

    setTimeout(() => {
      clearInterval(spinInterval)
      stopSpinSound()
      setIsSpinning(false)

      // Pick a random moto (1 or 2) for demo; real integration fires via postMessage
      const moto = Math.random() > 0.5 ? 1 : 2
      handleDrawResult(moto)
    }, 3000)
  }

  const handleDrawResult = (moto: number) => {
    playVictory()
    triggerConfetti()
    setVictoryPulse(true)
    setTimeout(() => setVictoryPulse(false), 2000)

    const randomRider = riders[Math.floor(Math.random() * riders.length)]
    const result: DrawResult = {
      id: crypto.randomUUID(),
      timestamp: nowTimeStr(),
      raceNum: Math.floor(Math.random() * 900) + 100,
      moto,
      riderId: randomRider?.rider_id,
      riderName: randomRider?.rider_name,
      plate: randomRider?.plate,
      gate: randomRider?.gate_position ?? undefined,
    }
    setResults((prev) => [result, ...prev])
  }

  // Listen for real Three.js / external messages
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'DRAW_RESULT') handleDrawResult(e.data.moto)
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [riders])

  const selectedCategory = categories.find((c) => c.id === selectedCategoryId)

  return (
    <div className="flex min-h-screen bg-[#0e0e0e] text-[#e5e2e1] font-sans overflow-x-hidden">
      {/* Carbon texture overlay */}
      <style>{`
        .carbon-bg {
          background-color: #0e0e0e;
          background-image:
            linear-gradient(45deg, #131313 25%, transparent 25%, transparent 75%, #131313 75%, #131313),
            linear-gradient(45deg, #131313 25%, transparent 25%, transparent 75%, #131313 75%, #131313);
          background-size: 8px 8px;
          background-position: 0 0, 4px 4px;
        }
        .racing-skew { transform: skew(-10deg); }
        .neon-underglow { box-shadow: 0 0 20px rgba(255,0,0,0.4); }
        .checkered-border {
          background-image:
            linear-gradient(45deg, #353534 25%, transparent 25%),
            linear-gradient(-45deg, #353534 25%, transparent 25%),
            linear-gradient(45deg, transparent 75%, #353534 75%),
            linear-gradient(-45deg, transparent 75%, #353534 75%);
          background-size: 8px 8px;
          background-position: 0 0, 0 4px, 4px 4px, 4px 0;
        }
        #results-list::-webkit-scrollbar, #rider-list::-webkit-scrollbar { width: 4px; }
        #results-list::-webkit-scrollbar-track, #rider-list::-webkit-scrollbar-track { background: #1c1b1b; }
        #results-list::-webkit-scrollbar-thumb, #rider-list::-webkit-scrollbar-thumb { background: #ff0000; }
        @keyframes scanning {
          0%   { transform: translateY(-100%); opacity: 0; }
          50%  { opacity: 0.5; }
          100% { transform: translateY(400%); opacity: 0; }
        }
        .scan-line { animation: scanning 2s linear infinite; }
        @keyframes victory-pulse {
          0%   { box-shadow: 0 0 0 0 rgba(255,0,0,0.7); }
          50%  { box-shadow: 0 0 20px 10px rgba(255,0,0,0); }
          100% { box-shadow: 0 0 0 0 rgba(255,0,0,0); }
        }
        .victory-animation { animation: victory-pulse 0.5s ease-out 3; }
        @keyframes slide-in {
          from { transform: skew(-10deg) translateX(100%); opacity: 0; }
          to   { transform: skew(-10deg) translateX(0); opacity: 1; }
        }
        .result-enter { animation: slide-in 0.4s cubic-bezier(0.22,1,0.36,1) forwards; }
      `}</style>

      <main className="flex-1 p-6 carbon-bg pb-32">
        {/* Back button */}
        <Link
          href={`/mc/${eventId}`}
          className="fixed top-6 right-6 z-50 flex items-center gap-2 rounded border border-[#ff0000]/30 bg-[#2a2a2a]/80 px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-[#e5e2e1] backdrop-blur-sm transition-all hover:bg-[#ff0000]"
        >
          ← Kembali ke MC
        </Link>

        <div className="mx-auto max-w-7xl space-y-6">
          {/* ── Control Panel ── */}
          <div className="border border-[#2a2a2a] bg-[#201f1f] p-6 space-y-6">
            <div className="flex items-start justify-between border-b border-[#2a2a2a] pb-4">
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <h1 className="text-2xl font-black italic uppercase tracking-tight text-[#e5e2e1]">
                    Live Draw (Internal)
                  </h1>
                  <span className="rounded bg-[#e7f5ed] px-2 py-0.5 text-[10px] font-bold uppercase text-[#2a7a4b]">
                    Internal Live Draw
                  </span>
                </div>
                <p className="text-[12px] text-[#ebbbb4]">
                  Draw manual dengan roulette, lalu simpan hasilnya sebagai Moto 1 &amp; Moto 2 (gate Moto 2 otomatis dibalik).
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
              {/* Category selector */}
              <div className="space-y-2">
                <label className="block text-[10px] font-bold uppercase text-[#ebbbb4]">Pilih Kategori</label>
                <select
                  value={selectedCategoryId}
                  onChange={(e) => setSelectedCategoryId(e.target.value)}
                  className="w-full border border-[#2a2a2a] bg-[#1c1b1b] px-4 py-2 font-mono text-sm text-[#e5e2e1] focus:border-[#ff0000] focus:outline-none"
                >
                  <option value="">-- Pilih Kategori --</option>
                  {loadingCats && <option disabled>Memuat...</option>}
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              {/* Max per batch */}
              <div className="space-y-2">
                <label className="block text-[10px] font-bold uppercase text-[#ebbbb4]">Maks Rider Per Batch</label>
                <input
                  type="number"
                  value={maxPerBatch}
                  min={1}
                  max={32}
                  onChange={(e) => setMaxPerBatch(Number(e.target.value))}
                  className="w-full border border-[#2a2a2a] bg-[#1c1b1b] px-4 py-2 font-mono text-sm text-[#e5e2e1] focus:border-[#ff0000] focus:outline-none"
                />
              </div>
            </div>

            {error && (
              <p className="rounded border border-[#ff0000]/30 bg-[#ff0000]/10 px-4 py-2 text-sm text-[#ffb4a8]">
                {error}
              </p>
            )}
          </div>

          {/* ── Main Layout ── */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* Left: Wheel */}
            <div className="lg:col-span-8 space-y-6">
              <div
                id="wheel-container"
                className="relative flex min-h-[500px] flex-col items-center overflow-hidden border border-[#2a2a2a] bg-[#1c1b1b] p-6"
              >
                {/* Checkered overlay */}
                <div className="pointer-events-none absolute inset-0 checkered-border opacity-5" />

                {/* Confetti */}
                {confettiItems.map((c) => (
                  <div
                    key={c.id}
                    className="pointer-events-none absolute z-[100] h-2 w-2"
                    style={{
                      left: `${c.x}%`,
                      top: `${c.y}%`,
                      backgroundColor: c.color,
                      transform: `rotate(${Math.random() * 360}deg)`,
                      animation: 'slide-in 1.2s ease-out forwards',
                    }}
                  />
                ))}

                {/* Header */}
                <div className="z-10 mb-8 flex w-full items-start justify-between">
                  <div>
                    <h2 className="text-xl font-black italic uppercase text-[#e5e2e1]">Wheel Spin</h2>
                    <div className="mt-1 flex items-center gap-2">
                      <span className={`text-[10px] font-bold uppercase ${isSpinning ? 'text-[#e9c400]' : 'text-[#ff0000]'}`}>
                        {isSpinning ? 'SPINNING...' : 'Ready'}
                      </span>
                      <span className="text-[#353534]">|</span>
                      <span className="text-[10px] font-medium uppercase text-[#ebbbb4]">
                        Total rider: {riders.length}
                      </span>
                      <span className="text-[10px] font-medium uppercase text-[#ebbbb4]">
                        Maks: {maxPerBatch}
                      </span>
                      {selectedCategory && (
                        <span className="text-[10px] font-bold uppercase text-[#e9c400]">
                          {selectedCategory.name}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Wheel visual */}
                <div className="relative z-10 flex h-[350px] w-full items-center justify-center">
                  {/* Pointer */}
                  <div className="absolute -mt-4 top-0 left-1/2 z-20 -translate-x-1/2">
                    <span className="material-symbols-outlined text-6xl text-[#ff0000]"
                      style={{ fontVariationSettings: "'FILL' 1" }}>
                      arrow_drop_down
                    </span>
                  </div>

                  {/* Mock wheel */}
                  <div
                    ref={wheelRef}
                    id="visual-wheel"
                    className="relative flex h-64 w-64 items-center justify-center overflow-hidden rounded-full border-8 border-[#2a2a2a]"
                    style={{ transform: `rotate(${wheelRotation}deg)`, transition: isSpinning ? 'none' : 'transform 0.3s ease-out' }}
                  >
                    <div className="absolute inset-0 bg-gradient-to-tr from-[#ff0000]/20 to-transparent" />
                    <span className="material-symbols-outlined text-6xl text-[#2a2a2a]">sports_motorsports</span>
                  </div>
                </div>

                {/* Spin button */}
                <button
                  onClick={handleSpin}
                  disabled={isSpinning}
                  className="group relative z-10 mt-6 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <div className="absolute inset-0 bg-[#ff0000] opacity-30 blur-xl transition-opacity group-hover:opacity-60" />
                  <div className="racing-skew neon-underglow border-b-4 border-white bg-[#ff0000] px-24 py-4 text-2xl font-black italic uppercase text-white transition-all active:translate-y-1 active:border-b-0">
                    SPIN DRAW
                  </div>
                </button>
              </div>

              {/* Rider Preview */}
              <div className="border border-[#2a2a2a] bg-[#1c1b1b] p-6">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-[10px] font-bold uppercase tracking-widest text-[#ff0000]">Preview Rider</h3>
                  <span className="text-[10px] italic text-[#ebbbb4]">Gate positions: {maxPerBatch}</span>
                </div>

                {loadingRiders && (
                  <p className="text-sm text-[#ebbbb4] italic">Memuat rider...</p>
                )}

                {!loadingRiders && !selectedCategoryId && (
                  <p className="text-sm italic text-[#603e39]">Pilih kategori untuk melihat rider.</p>
                )}

                <div className="max-h-[300px] space-y-2 overflow-y-auto pr-2" id="rider-list">
                  {riders.map((rider) => (
                    <div
                      key={rider.rider_id}
                      className="group flex items-center justify-between border border-[#2a2a2a] bg-[#201f1f] p-3 transition-colors hover:border-[#ff0000]"
                    >
                      <div>
                        <p className="text-[14px] font-bold uppercase">{rider.rider_name}</p>
                        <p className={`text-[10px] font-bold uppercase ${
                          rider.status === 'READY' ? 'text-green-500'
                          : rider.status === 'ABSENT' ? 'text-red-400'
                          : 'text-[#ebbbb4]'
                        }`}>
                          {rider.status === 'READY' ? 'Siap dipilih' : rider.status === 'ABSENT' ? 'Absent' : rider.status}
                        </p>
                      </div>
                      <span className="font-mono text-xl font-black text-[#603e39] group-hover:text-[#ff0000] transition-colors">
                        {rider.plate}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right: Results */}
            <div
              id="results-panel"
              className={`flex h-fit flex-col border border-[#2a2a2a] bg-[#1c1b1b] lg:col-span-4 ${victoryPulse ? 'victory-animation' : ''}`}
            >
              <div className="flex items-center justify-between border-b border-[#2a2a2a] bg-[#201f1f] p-6">
                <div>
                  <h3 className="text-[10px] font-bold uppercase tracking-widest text-[#e5e2e1]">Live Results</h3>
                  <p className="text-[10px] italic text-[#ebbbb4]">
                    {results.length === 0 ? 'Belum ada hasil draw.' : `${results.length} draw tercatat`}
                  </p>
                </div>
                <div className="flex items-center gap-2 rounded-full border border-[#ff0000]/30 bg-[#0e0e0e] px-3 py-1">
                  <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#ff0000]" />
                  <span className="text-[9px] font-bold uppercase text-[#ff0000]">Recording</span>
                </div>
              </div>

              <div className="relative min-h-[300px] max-h-[600px] flex-1 space-y-4 overflow-y-auto p-4" id="results-list">
                {/* Scan line */}
                {results.length === 0 && (
                  <>
                    <div className="pointer-events-none absolute inset-x-4 bottom-4 top-4 z-0 overflow-hidden">
                      <div className="scan-line absolute h-1 w-full bg-[#ff0000]/20 blur-sm" />
                    </div>
                    <div className="relative z-10 flex flex-col items-center justify-center border-2 border-dashed border-[#2a2a2a] p-12 text-[#603e39] opacity-50 italic">
                      <span className="material-symbols-outlined mb-2 animate-spin text-4xl" style={{ animationDuration: '3s' }}>refresh</span>
                      <span className="animate-pulse text-[10px] font-bold uppercase tracking-widest">Awaiting telemetry...</span>
                    </div>
                  </>
                )}

                {results.map((r) => (
                  <div
                    key={r.id}
                    className="result-enter relative z-20 flex items-center justify-between border-l-4 border-[#ff0000] bg-[#2a2a2a] p-4 shadow-lg racing-skew"
                  >
                    <div>
                      <div className="mb-1 flex items-center gap-2">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#ff0000]" />
                        <span className="text-[10px] font-bold uppercase tracking-widest text-[#ff0000]">
                          RACE #{r.raceNum}
                        </span>
                      </div>
                      <span className="text-[16px] font-bold italic uppercase text-[#e5e2e1]">
                        MOTO {r.moto} SELECTED
                      </span>
                      {r.riderName && (
                        <p className="text-[11px] text-[#ebbbb4] mt-0.5">{r.riderName} · #{r.plate}</p>
                      )}
                    </div>
                    <span className="bg-[#0e0e0e] px-2 py-1 font-mono text-[10px] text-[#ebbbb4]">
                      {r.timestamp}
                    </span>
                  </div>
                ))}
              </div>

              <div className="border-t border-[#2a2a2a] bg-[#0e0e0e] p-6">
                <button
                  onClick={() => {
                    const csv = ['Race,Moto,Rider,Plate,Gate,Time']
                      .concat(results.map((r) => `${r.raceNum},${r.moto},${r.riderName ?? ''},${r.plate ?? ''},${r.gate ?? ''},${r.timestamp}`))
                      .join('\n')
                    const blob = new Blob([csv], { type: 'text/csv' })
                    const url = URL.createObjectURL(blob)
                    const a = document.createElement('a')
                    a.href = url; a.download = `draw-${eventId}.csv`; a.click()
                    URL.revokeObjectURL(url)
                  }}
                  className="flex w-full items-center justify-center gap-2 border border-[#2a2a2a] py-3 text-[10px] font-bold uppercase text-[#ebbbb4] transition-colors hover:bg-[#1c1b1b] hover:text-[#ff0000]"
                >
                  <span className="material-symbols-outlined text-sm">download</span>
                  EXPORT DRAW HISTORY
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
