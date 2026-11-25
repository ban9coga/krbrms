import type { Metadata } from 'next'
import { SITE_URL } from './structuredData'

export const canonicalMetadata = (pathname: string): Metadata => ({
  alternates: {
    canonical: `${SITE_URL}${pathname.startsWith('/') ? pathname : `/${pathname}`}`,
  },
})
