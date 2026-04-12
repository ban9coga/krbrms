import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: {
    default: 'Pushbike Race Management Platform',
    template: '%s | Pushbike Race Management Platform',
  },
  description:
    'Sistem manajemen event pushbike real-time: live scoring, hasil race, dan dashboard admin untuk organizer di Indonesia.',
  keywords: ['pushbike', 'runbike', 'race management', 'live results', 'scoring', 'Padang', 'Indonesia'],
  authors: [{ name: 'FernTech Studio' }],
  creator: 'FernTech Studio',
  metadataBase: new URL('https://krbrms.vercel.app'),
  verification: {
    google: '5hpTlLiEQ5f3Qldh9rkNfgpdnsHzMExsT9IAEeCR9XA', // tambah ini
  },  
  openGraph: {
    title: 'Pushbike Race Management Platform',
    description: 'Sistem manajemen event pushbike real-time: live scoring, hasil race, dan dashboard admin.',
    url: 'https://krbrms.vercel.app',
    siteName: 'Pushbike Race Management Platform',
    locale: 'id_ID',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Pushbike Race Management Platform',
    description: 'Sistem manajemen event pushbike real-time: live scoring, hasil race, dan dashboard admin.',
  },
  robots: {
    index: true,
    follow: true,
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body style={{ margin: 0, fontFamily: 'sans-serif' }}>{children}</body>
    </html>
  )
}