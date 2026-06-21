import type { Metadata } from 'next'
import FloatingLiveScoreButton from '../components/FloatingLiveScoreButton'
import { PwaRegister } from '../components/PwaRegister'
import { ThemeProvider } from '../components/ThemeProvider'
import { getLiveEvent } from '../lib/liveEvent'
import './globals.css'

export const revalidate = 30

export const metadata: Metadata = {
  title: {
    default: 'RacePushbike — Live Skor & Pendaftaran Race Pushbike Indonesia',
    template: '%s | Pushbike Race Management Platform',
  },
  manifest: '/manifest.webmanifest',
  description:
    'Cek live skor race pushbike, daftarkan rider, dan pantau hasil race real-time. Platform terpercaya untuk komunitas pushbike di Indonesia.',
  keywords: ['pushbike', 'runbike', 'race management', 'live results', 'scoring', 'Padang', 'Indonesia'],
  authors: [{ name: 'FernTech Studio' }],
  creator: 'FernTech Studio',
  metadataBase: new URL('https://racepushbike.com'),
  verification: {
    google: '5hpTlLiEQ5f3Qldh9rkNfgpdnsHzMExsT9IAEeCR9XA', // tambah ini
  },
  openGraph: {
    title: 'RacePushbike — Live Skor & Pendaftaran Race Pushbike Indonesia',
    description:
      'Cek live skor race pushbike, daftarkan rider, dan pantau hasil race real-time. Platform terpercaya untuk komunitas pushbike di Indonesia.',
    url: 'https://racepushbike.com',
    siteName: 'Pushbike Race Management Platform',
    locale: 'id_ID',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'RacePushbike — Live Skor & Pendaftaran Race Pushbike Indonesia',
    description:
      'Cek live skor race pushbike, daftarkan rider, dan pantau hasil race real-time. Platform terpercaya untuk komunitas pushbike di Indonesia.',
  },
  robots: {
    index: true,
    follow: true,
  },
  appleWebApp: {
    capable: true,
    title: 'RacePushbike',
    statusBarStyle: 'default',
  },
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const liveEvent = await getLiveEvent()

  return (
    <html lang="id">
      <body style={{ margin: 0, fontFamily: 'sans-serif' }}>
        <PwaRegister />
        <ThemeProvider>
          {children}
          <FloatingLiveScoreButton hasLiveEvent={Boolean(liveEvent)} />
        </ThemeProvider>
      </body>
    </html>
  )
}
