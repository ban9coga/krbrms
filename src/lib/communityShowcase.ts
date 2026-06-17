import type { BusinessSettings } from './eventService'

export type CommunityShowcaseLogo = {
  name: string
  logoSrc: string
  alt?: string
}

export const getCommunityShowcaseLogos = (settingsRows: Array<{ business_settings?: unknown }>): CommunityShowcaseLogo[] => {
  const logos = new Map<string, CommunityShowcaseLogo>()

  for (const row of settingsRows) {
    const business = row.business_settings && typeof row.business_settings === 'object' && !Array.isArray(row.business_settings)
      ? (row.business_settings as BusinessSettings)
      : null
    if (business?.community_showcase_enabled === false) continue

    const dedicatedLogos = Array.isArray(business?.community_showcase_logos) ? business.community_showcase_logos : []
    const dedicatedActiveLogos = dedicatedLogos.filter((item) => item.is_active !== false && item.logo_url?.trim())
    for (const item of dedicatedActiveLogos.sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999))) {
      const name = item.name?.trim() || 'Community'
      const logoSrc = item.logo_url?.trim()
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
