'use client'

import { useState } from 'react'
import { usePushSubscription } from '../hooks/usePushSubscription'

interface RiderNotificationButtonProps {
  eventId: string
  riderId: string
  riderName: string
  riderPlate?: string
  className?: string
}

export default function RiderNotificationButton({
  eventId,
  riderId,
  riderName,
  riderPlate,
  className = '',
}: RiderNotificationButtonProps) {
  const { isSupported, isIOSBrowser, isSubscribed, isLoading, error, subscribe, unsubscribe } = usePushSubscription(
    eventId,
    riderId
  )
  const [confirming, setConfirming] = useState<'subscribe' | 'unsubscribe' | 'ios_instruction' | null>(null)
  const [processingAction, setProcessingAction] = useState<'subscribe' | 'unsubscribe' | null>(null)

  if (!isSupported && !isIOSBrowser) return null

  const handleBellClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (isIOSBrowser) {
      setConfirming('ios_instruction')
      return
    }
    if (isLoading) return
    if (isSubscribed) {
      setConfirming('unsubscribe')
    } else {
      setConfirming('subscribe')
    }
  }

  const handleConfirm = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (confirming !== 'subscribe' && confirming !== 'unsubscribe') return

    const action = confirming
    const startedAt = performance.now()
    setProcessingAction(action)

    try {
      // Let the busy state paint before opening the browser permission prompt or starting the request.
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()))
      if (action === 'subscribe') {
        await subscribe()
      } else {
        await unsubscribe()
      }

      // Keep feedback visible briefly when the operation completes very quickly.
      const remainingFeedbackMs = 350 - (performance.now() - startedAt)
      if (remainingFeedbackMs > 0) {
        await new Promise((resolve) => window.setTimeout(resolve, remainingFeedbackMs))
      }
    } finally {
      setProcessingAction(null)
      setConfirming(null)
    }
  }

  const handleCancel = (e: React.MouseEvent) => {
    e.stopPropagation()
    setConfirming(null)
  }

  return (
    <div className={`relative inline-flex items-center gap-1.5 ${className}`}>
      {/* Bell icon button */}
      <button
        type="button"
        disabled={isLoading || processingAction !== null}
        onClick={handleBellClick}
        title={
          isSubscribed
            ? `Notifikasi aktif untuk ${riderName} (#${riderPlate || '-'}). Klik untuk matikan.`
            : `Aktifkan notifikasi panggilan gate untuk ${riderName} (#${riderPlate || '-'})`
        }
        aria-label={isSubscribed ? 'Notifikasi aktif' : 'Aktifkan notifikasi'}
        className={`
          inline-flex items-center justify-center
          transition-all duration-200 disabled:opacity-50 select-none
          ${isSubscribed
            ? 'w-7 h-7 rounded-full bg-amber-400/20 border-2 border-amber-400 text-amber-300 shadow-[0_0_8px_rgba(251,191,36,0.4)]'
            : 'w-6 h-6 text-orange-400 hover:text-orange-300 hover:scale-110'
          }
        `}
      >
        {isLoading ? (
          <span className="text-[10px] leading-none animate-pulse">⏳</span>
        ) : (
          <span className="text-[14px] leading-none">🔔</span>
        )}
      </button>

      {/* Inline confirmation dialog */}
      {confirming && (
        <div
          className="inline-flex items-center gap-1.5 bg-slate-800/95 border border-white/10 rounded-xl px-3 py-1.5 animate-fade-in shadow-xl z-50 absolute mt-8 right-0 max-w-[250px]"
          onClick={(e) => e.stopPropagation()}
        >
          {confirming === 'ios_instruction' ? (
            <div className="flex flex-col gap-2 w-full">
              <span className="text-[11px] leading-snug text-slate-200">
                <strong className="text-amber-400">Khusus iPhone:</strong><br/>
                1. Tekan tombol Bagikan (Share), lalu pilih <strong>&quot;Add to Home Screen&quot; (Tambahkan ke Layar Utama)</strong>.<br />
                2. Setelah ikon RacePushBike muncul, buka aplikasi dari ikon itu di layar utama (bukan dari tab Safari).<br />
                3. Cari rider ini, tekan ikon lonceng lagi, pilih <strong>Ya</strong>, lalu izinkan notifikasi saat diminta iPhone.
              </span>
              <button
                type="button"
                onClick={handleCancel}
                className="self-end text-[10px] font-bold text-slate-300 hover:text-white px-2 py-1 rounded bg-slate-700/50 hover:bg-slate-600 transition-colors"
              >
                Mengerti
              </button>
            </div>
          ) : (
            <>
              <span className="text-[10px] text-slate-200 whitespace-nowrap" aria-live="polite">
                {processingAction === confirming ? (
                  <span className="inline-flex items-center gap-1.5">
                    <span className="animate-spin" aria-hidden="true">◌</span>
                    {confirming === 'subscribe' ? 'Mengaktifkan notifikasi…' : 'Mematikan notifikasi…'}
                  </span>
                ) : confirming === 'subscribe' ? (
                  'Aktifkan notifikasi rider ini?'
                ) : (
                  'Matikan notifikasi rider ini?'
                )}
              </span>
              <button
                type="button"
                disabled={processingAction !== null || isLoading}
                onClick={handleConfirm}
                className="text-[10px] font-bold text-emerald-400 hover:text-emerald-300 px-1 py-0.5 rounded hover:bg-emerald-500/10 transition-colors disabled:opacity-50 disabled:cursor-wait"
              >
                {processingAction !== null ? 'Tunggu…' : 'Ya'}
              </button>
              <button
                type="button"
                disabled={processingAction !== null || isLoading}
                onClick={handleCancel}
                className="text-[10px] font-bold text-slate-400 hover:text-slate-200 px-1 py-0.5 rounded hover:bg-white/10 transition-colors disabled:opacity-50 disabled:cursor-wait"
              >
                Tidak
              </button>
            </>
          )}
        </div>
      )}

      {error && (
        <span className="text-[9px] font-semibold text-rose-400">
          {error}
        </span>
      )}
    </div>
  )
}
