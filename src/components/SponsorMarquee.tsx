'use client'

import type { BusinessSettings, EventSponsor } from '../lib/eventService'

type SponsorPlacement = 'event_page' | 'live_display'

type SponsorMarqueeProps = {
  businessSettings?: BusinessSettings | null
  sponsorLogoUrls?: string[] | null
  placement: SponsorPlacement
  title?: string
  subtitle?: string
  compact?: boolean
}

type ResolvedSponsor = {
  id: string
  name: string
  tier: string
  logoUrl: string
  href: string | null
  priority: number
  sortOrder: number
}

const tierOrder: Record<string, number> = {
  TITLE: 0,
  MAIN: 1,
  SUPPORT: 2,
  MEDIA: 3,
  COMMUNITY: 4,
  PARTNER: 5,
}

const isTruthyFlag = (value: boolean | null | undefined, fallback = false) =>
  typeof value === 'boolean' ? value : fallback

const normalizeSponsors = (
  businessSettings?: BusinessSettings | null,
  sponsorLogoUrls?: string[] | null,
  placement: SponsorPlacement = 'event_page'
): ResolvedSponsor[] => {
  const richSponsors = Array.isArray(businessSettings?.sponsors) ? businessSettings?.sponsors ?? [] : []

  const filteredRich = richSponsors
    .map((item, index) => {
      const sponsor = (item ?? {}) as EventSponsor
      const isActive = sponsor.is_active !== false
      const placementAllowed =
        placement === 'event_page'
          ? isTruthyFlag(sponsor.show_on_event_page, true)
          : isTruthyFlag(sponsor.show_on_live_display, true)
      const logoUrl = sponsor.logo_url?.trim()
      if (!isActive || !placementAllowed || !logoUrl) return null
      return {
        id: sponsor.id?.trim() || `sponsor-${index + 1}`,
        name: sponsor.name?.trim() || `Sponsor ${index + 1}`,
        tier: sponsor.tier?.trim() || 'SUPPORT',
        logoUrl,
        href: sponsor.website_url?.trim() || sponsor.instagram_url?.trim() || null,
        priority: Number(sponsor.display_priority ?? 0),
        sortOrder: Number(sponsor.sort_order ?? index),
      } satisfies ResolvedSponsor
    })
    .filter(Boolean) as ResolvedSponsor[]

  if (filteredRich.length > 0) {
    return filteredRich.sort((a, b) => {
      const tierDelta = (tierOrder[a.tier] ?? 99) - (tierOrder[b.tier] ?? 99)
      if (tierDelta !== 0) return tierDelta
      if (b.priority !== a.priority) return b.priority - a.priority
      return a.sortOrder - b.sortOrder
    })
  }

  return (sponsorLogoUrls ?? [])
    .map((url, index) => (typeof url === 'string' ? url.trim() : ''))
    .filter(Boolean)
    .map((logoUrl, index) => ({
      id: `legacy-sponsor-${index + 1}`,
      name: `Sponsor ${index + 1}`,
      tier: 'SUPPORT',
      logoUrl,
      href: null,
      priority: 0,
      sortOrder: index,
    }))
}

export default function SponsorMarquee({
  businessSettings,
  sponsorLogoUrls,
  placement,
  title,
  subtitle,
  compact = false,
}: SponsorMarqueeProps) {
  const enabled =
    businessSettings?.sponsor_section_enabled == null
      ? true
      : Boolean(businessSettings?.sponsor_section_enabled)

  const sponsors = normalizeSponsors(businessSettings, sponsorLogoUrls, placement)

  if (!enabled || sponsors.length === 0) return null

  const sectionTitle =
    title ||
    businessSettings?.sponsor_section_title?.trim() ||
    (placement === 'live_display' ? 'Supported By' : 'Official Sponsors')
  const sectionSubtitle =
    subtitle ||
    businessSettings?.sponsor_section_subtitle?.trim() ||
    (placement === 'live_display'
      ? 'Partner event yang ikut mendukung board ini'
      : 'Partner dan sponsor yang mendukung event ini')

  const animate = sponsors.length > 1
  const duration = Math.max(22, sponsors.length * (compact ? 3.8 : 4.8))
  const renderItems = (suffix: string) =>
    sponsors.map((sponsor) => {
      const image = (
        <img
          key={`${sponsor.id}-${suffix}`}
          src={sponsor.logoUrl}
          alt={sponsor.name}
          loading="lazy"
          className={`w-auto object-contain ${compact ? 'h-8 sm:h-10' : 'h-10 sm:h-12 md:h-14'}`}
        />
      )

      return sponsor.href ? (
        <a
          key={`${sponsor.id}-${suffix}`}
          href={sponsor.href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex shrink-0 items-center rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm transition-transform hover:scale-[1.02]"
          title={sponsor.name}
        >
          {image}
        </a>
      ) : (
        <div
          key={`${sponsor.id}-${suffix}`}
          className="inline-flex shrink-0 items-center rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm"
          title={sponsor.name}
        >
          {image}
        </div>
      )
    })

  return (
    <section className={`overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white/92 shadow-[0_14px_34px_rgba(15,23,42,0.08)] ${compact ? 'px-4 py-4' : 'px-4 py-5 sm:px-6'}`}>
      <div className="mb-4 grid gap-1">
        <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-amber-500">{sectionTitle}</p>
        <p className="text-sm font-semibold text-slate-500">{sectionSubtitle}</p>
      </div>

      <div className="sponsor-marquee-shell">
        {animate ? (
          <div
            className="sponsor-marquee-track"
            style={{ ['--sponsor-duration' as string]: `${duration}s` }}
          >
            <div className="sponsor-marquee-group">{renderItems('a')}</div>
            <div className="sponsor-marquee-group" aria-hidden="true">
              {renderItems('b')}
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">{renderItems('single')}</div>
        )}
      </div>

      <style jsx>{`
        .sponsor-marquee-shell {
          overflow: hidden;
          width: 100%;
        }

        .sponsor-marquee-track {
          display: flex;
          width: max-content;
          animation: sponsor-marquee var(--sponsor-duration, 28s) linear infinite;
          will-change: transform;
        }

        .sponsor-marquee-group {
          display: flex;
          align-items: center;
          gap: 0.9rem;
          padding-right: 0.9rem;
          flex-shrink: 0;
        }

        .sponsor-marquee-shell:hover .sponsor-marquee-track {
          animation-play-state: paused;
        }

        @keyframes sponsor-marquee {
          from {
            transform: translateX(0);
          }
          to {
            transform: translateX(-50%);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .sponsor-marquee-track {
            animation: none;
          }
        }
      `}</style>
    </section>
  )
}
