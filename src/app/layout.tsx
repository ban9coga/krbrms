import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: {
    default: 'Pushbike Race Management Platform',
    template: '%s | Pushbike Race Management Platform',
  },
  description:
    'Sistem manajemen event pushbike: pendaftaran rider, live scoring, hasil, dan dashboard admin.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body style={{ margin: 0, fontFamily: 'sans-serif' }}>{children}</body>
    </html>
  )
}
