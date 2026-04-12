import { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/login',
        '/admin',
        '/super-admin',
        '/race-control',
        '/race-director',
        '/jury',
        '/scoring',
        '/mc',
        '/jc',
      ],
    },
    sitemap: 'https://krbrms.vercel.app/sitemap.xml',
  }
}