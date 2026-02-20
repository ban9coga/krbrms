import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: {
    default: 'KRB Race Management System',
    template: '%s | KRB Race Management System',
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
