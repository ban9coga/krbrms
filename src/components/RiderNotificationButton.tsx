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
  const { isSupported, isSubscribed, isLoading, error, subscribe, unsubscribe } = usePushSubscription(
    eventId,
    riderId
  )
  const [confirming, setConfirming] = useState<'subscribe' | 'unsubscribe' | null>(null)

  if (!isSupported) return null

  const handleBellClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (isLoading) return
    if (isSubscribed) {
      setConfirming('unsubscribe')
    } else {
      setConfirming('subscribe')
    }
  }

  const handleConfirm = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (confirming === 'subscribe') {
      await subscribe()
    } else if (confirming === 'unsubscribe') {
      await unsubscribe()
    }
    setConfirming(null)
  }

  const handleCancel = (e: React.MouseEvent) => {
    e.stopPropagation()
    setConfirming(null)
  }

  return (
    <div className={`inline-flex items-center gap-1.5 ${className}`}>
      {/* Bell icon button */}
      <button
        type="button"
        disabled={isLoading}
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
          className="inline-flex items-center gap-1.5 bg-slate-800/90 border border-white/10 rounded-full px-2 py-0.5 animate-fade-in"
          onClick={(e) => e.stopPropagation()}
        >
          <span className="text-[10px] text-slate-200 whitespace-nowrap">
            {confirming === 'subscribe'
              ? `Aktifkan notifikasi rider ini?`
              : `Matikan notifikasi rider ini?`}
          </span>
          <button
            type="button"
            onClick={handleConfirm}
            className="text-[10px] font-bold text-emerald-400 hover:text-emerald-300 px-1 py-0.5 rounded hover:bg-emerald-500/10 transition-colors"
          >
            Ya
          </button>
          <button
            type="button"
            onClick={handleCancel}
            className="text-[10px] font-bold text-slate-400 hover:text-slate-200 px-1 py-0.5 rounded hover:bg-white/10 transition-colors"
          >
            Tidak
          </button>
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
