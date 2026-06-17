import type { BusinessSettings, EventSponsor } from './eventService'

export type CommunityShowcaseLogo = {
  name: string
  logoSrc: string
  alt?: string
}

const isCommunitySponsor = (sponsor: EventSponsor) =>
  sponsor.tier === 'COMMUNITY' && sponsor.is_active !== false && Boolean(sponsor.logo_url?.trim())

export const getCommunityShowcaseLogos = (settingsRows: Array<{ business_settings?: unknown }>): CommunityShowcaseLogo[] => {
  const logos = new Map<string, CommunityShowcaseLogo>()

  for (const row of settingsRows) {
    const business = row.business_settings && typeof row.business_settings === 'object' && !Array.isArray(row.business_settings)
      ? (row.business_settings as BusinessSettings)
      : null
    const sponsors = Array.isArray(business?.sponsors) ? business.sponsors : []

    for (const sponsor of sponsors) {
      if (!isCommunitySponsor(sponsor)) continue
      const name = sponsor.name?.trim() || 'Community'
      const logoSrc = sponsor.logo_url?.trim()
      if (!logoSrc) continue
      const key = `${name.toLowerCase()}|${logoSrc}`
      if (!logos.has(key)) {
        logos.set(key, {
          name,
          logoSrc,
          alt: `${name} logo`,
        })
      }
    }
  }

  return [...logos.values()]
}
