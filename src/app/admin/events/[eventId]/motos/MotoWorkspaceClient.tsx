'use client'

import Link from 'next/link'
import MotosClient from './MotosClient'
import MotoSequenceClient from '../moto-sequence/MotoSequenceClient'

type WorkspaceTab = 'motos' | 'sequence'

export default function MotoWorkspaceClient({
  eventId,
  initialTab,
}: {
  eventId: string
  initialTab: WorkspaceTab
}) {
  const tabs: Array<{ id: WorkspaceTab; label: string; href: string }> = [
    { id: 'motos', label: 'Kontrol Moto', href: `/admin/events/${eventId}/motos` },
    { id: 'sequence', label: 'Urutan Race', href: `/admin/events/${eventId}/motos?tab=sequence` },
  ]

  return (
    <div className="grid gap-3">
      <nav
        aria-label="Menu motos event"
        className="flex w-fit max-w-full flex-wrap gap-2 rounded-xl border border-slate-200 bg-white p-1.5 shadow-sm"
      >
        {tabs.map((tab) => {
          const active = initialTab === tab.id
          return (
            <Link
              key={tab.id}
              href={tab.href}
              scroll={false}
              aria-current={active ? 'page' : undefined}
              className={`inline-flex min-h-10 items-center justify-center rounded-lg px-4 py-2 text-sm font-extrabold transition-colors ${
                active
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </Link>
          )
        })}
      </nav>
      {initialTab === 'sequence' ? <MotoSequenceClient eventId={eventId} /> : <MotosClient eventId={eventId} />}
    </div>
  )
}
