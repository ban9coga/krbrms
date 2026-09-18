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
  const [feedback, setFeedback] = useState<string | null>(null)

  if (!isSupported) return null

  const handleToggle = async (e: React.MouseEvent) => {
    e.stopPropagation()
    setFeedback(null)

    if (isSubscribed) {
      if (confirm(`Matikan notifikasi panggilan gate untuk ${riderName}?`)) {
        await unsubscribe()
        setFeedback('Notifikasi dimatikan')
        setTimeout(() => setFeedback(null), 3000)
      }
    } else {
      await subscribe()
      setFeedback('Notifikasi gate aktif!')
      setTimeout(() => setFeedback(null), 4000)
    }
  }

  return (
    <div className={`inline-flex items-center gap-1.5 ${className}`}>
      <button
        type="button"
        disabled={isLoading}
        onClick={handleToggle}
        title={
          isSubscribed
            ? `Notifikasi gate aktif untuk ${riderName} (#${riderPlate || '-'}). Klik untuk matikan.`
            : `Aktifkan notifikasi panggilan gate untuk ${riderName} (#${riderPlate || '-'})`
        }
        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold transition-colors ${
          isSubscribed
            ? 'bg-amber-500/20 text-amber-300 border border-amber-400/40 hover:bg-amber-500/30'
            : 'bg-white/10 text-slate-300 border border-white/20 hover:bg-white/20 hover:text-white'
        } disabled:opacity-50`}
      >
        <span className="text-[11px] leading-none">{isSubscribed ? '🔔' : '🔕'}</span>
        <span>{isLoading ? '...' : isSubscribed ? 'Notif Aktif' : 'Pantau Gate'}</span>
      </button>

      {feedback && (
        <span className="text-[9px] font-semibold text-emerald-400 animate-fade-in">
          {feedback}
        </span>
      )}
      {error && (
        <span className="text-[9px] font-semibold text-rose-400">
          {error}
        </span>
      )}
    </div>
  )
}
