'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export default function FloatingLiveScoreButton({ hasLiveEvent }: { hasLiveEvent: boolean }) {
  const pathname = usePathname()

  if (!hasLiveEvent) {
    return null
  }

  if (pathname === '/live-results' || pathname.startsWith('/live-results/')) {
    return null
  }

  return (
    <Link
      href="/live-results"
      className="floating-live-score-button floating-live-score-button-live"
      aria-label="Live Sekarang"
    >
      <span className="floating-live-score-pulse" aria-hidden="true" />
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M4 20V10" />
        <path d="M10 20V4" />
        <path d="M16 20v-7" />
        <path d="M22 20H2" />
      </svg>
      <span>Live Sekarang</span>
    </Link>
  )
}
