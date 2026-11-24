export const SITE_URL = 'https://racepushbike.com'
export const SITE_NAME = 'RacePushbike'
export const SITE_LOGO_URL = `${SITE_URL}/platform-logo.png`
export const SITE_INSTAGRAM_USERNAME = 'racepushbike'
export const SITE_INSTAGRAM_URL = `https://instagram.com/${SITE_INSTAGRAM_USERNAME}`
export const SITE_INSTAGRAM_DM_URL = `https://ig.me/m/${SITE_INSTAGRAM_USERNAME}`
export const SITE_WHATSAPP_NUMBER = '6282169009990'
export const SITE_WHATSAPP_DISPLAY = '0821 6900 9990'
export const SITE_WHATSAPP_URL = `https://wa.me/${SITE_WHATSAPP_NUMBER}`

export const serializeJsonLd = (data: unknown) => JSON.stringify(data).replace(/</g, '\\u003c')

export const siteStructuredData = [
  {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE_NAME,
    alternateName: 'RacePushbike.com',
    url: SITE_URL,
    logo: SITE_LOGO_URL,
    sameAs: [SITE_INSTAGRAM_URL],
  },
  {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    alternateName: 'RacePushbike.com',
    url: SITE_URL,
    publisher: {
      '@type': 'Organization',
      name: SITE_NAME,
      url: SITE_URL,
      logo: SITE_LOGO_URL,
    },
  },
]
