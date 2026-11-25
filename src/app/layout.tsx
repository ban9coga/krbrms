import type { Metadata, Viewport } from 'next'
import { Anton, Plus_Jakarta_Sans } from 'next/font/google'
import FloatingLiveScoreButton from '../components/FloatingLiveScoreButton'
import { AppDialogProvider } from '../components/AppDialogProvider'
import { LiveEventAvailabilityProvider } from '../components/PublicBottomBar'
import { PwaRegister } from '../components/PwaRegister'
import { ThemeProvider } from '../components/ThemeProvider'
import { getLiveEvent } from '../lib/liveEvent'
import { serializeJsonLd, siteStructuredData } from '../lib/structuredData'
import './globals.css'

export const revalidate = 30

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#24140d',
}

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap',
})

const anton = Anton({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-display',
  display: 'swap',
})

export const metadata: Metadata = {
  title: {
    default: 'Race Pushbike Indonesia — Jadwal, Pendaftaran & Live Skor | RacePushbike',
    template: '%s | RacePushbike',
  },
  manifest: '/manifest.webmanifest',
  description:
    'Cari jadwal race pushbike Indonesia, daftar rider, cek live skor, dan pantau hasil race real-time dari komunitas pushbike di berbagai kota.',
  authors: [{ name: 'FernTech Studio' }],
  creator: 'FernTech Studio',
  metadataBase: new URL('https://racepushbike.com'),
  verification: {
    google: '5hpTlLiEQ5f3Qldh9rkNfgpdnsHzMExsT9IAEeCR9XA', // tambah ini
  },
  openGraph: {
    title: 'Race Pushbike Indonesia — Jadwal, Pendaftaran & Live Skor | RacePushbike',
    description:
      'Cari jadwal race pushbike Indonesia, daftar rider, cek live skor, dan pantau hasil race real-time dari komunitas pushbike di berbagai kota.',
    url: 'https://racepushbike.com',
    siteName: 'RacePushbike',
    locale: 'id_ID',
    type: 'website',
    images: [{
      url: '/og-racepushbike.png',
      width: 1200,
      height: 630,
      alt: 'RacePushbike Indonesia — jadwal, pendaftaran, live score, dan hasil race pushbike',
    }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Race Pushbike Indonesia — Jadwal, Pendaftaran & Live Skor | RacePushbike',
    description:
      'Cari jadwal race pushbike Indonesia, daftar rider, cek live skor, dan pantau hasil race real-time dari komunitas pushbike di berbagai kota.',
    images: ['/og-racepushbike.png'],
  },
  robots: {
    index: true,
    follow: true,
  },
  appleWebApp: {
    capable: true,
    title: 'RacePushbike',
    statusBarStyle: 'black-translucent',
  },
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const liveEvent = await getLiveEvent()

  return (
    <html lang="id">
      <body className={`${plusJakartaSans.variable} ${anton.variable}`} style={{ margin: 0 }}>
        <script
          id="racepushbike-site-structured-data"
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(siteStructuredData) }}
        />
        <PwaRegister />
        <LiveEventAvailabilityProvider hasLiveEvent={Boolean(liveEvent)}>
          <ThemeProvider>
            <AppDialogProvider>
              {children}
              <FloatingLiveScoreButton hasLiveEvent={Boolean(liveEvent)} />
            </AppDialogProvider>
          </ThemeProvider>
        </LiveEventAvailabilityProvider>
      </body>
    </html>
  )
}
