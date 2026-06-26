import type { Metadata } from 'next'
import FloatingLiveScoreButton from '../components/FloatingLiveScoreButton'
import { PwaRegister } from '../components/PwaRegister'
import { ThemeProvider } from '../components/ThemeProvider'
import { getLiveEvent } from '../lib/liveEvent'
import './globals.css'

export const revalidate = 30

export const metadata: Metadata = {
  title: {
    default: 'Race Pushbike Indonesia — Jadwal, Pendaftaran & Live Skor | RacePushbike',
    template: '%s | RacePushbike',
  },
  manifest: '/manifest.webmanifest',
  description:
    'Cari jadwal race pushbike Indonesia, daftar rider, cek live skor, dan pantau hasil race real-time dari komunitas pushbike di berbagai kota.',
  keywords: [
    'race pushbike',
    'race pushbike indonesia',
    'jadwal race pushbike',
    'pendaftaran race pushbike',
    'live skor pushbike',
    'hasil race pushbike',
    'balance bike indonesia',
    'pushbike indonesia',
  ],
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
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Race Pushbike Indonesia — Jadwal, Pendaftaran & Live Skor | RacePushbike',
    description:
      'Cari jadwal race pushbike Indonesia, daftar rider, cek live skor, dan pantau hasil race real-time dari komunitas pushbike di berbagai kota.',
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
