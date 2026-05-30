import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'RacePushbike Race Management',
    short_name: 'RacePushbike',
    description: 'Akses cepat race management, motos, jury, MC, dan live display.',
    start_url: '/quick/motos',
    scope: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#facc15',
    orientation: 'any',
    icons: [
      {
        src: '/icon.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/apple-icon.png',
        sizes: '180x180',
        type: 'image/png',
      },
    ],
    shortcuts: [
      {
        name: 'Motos',
        short_name: 'Motos',
        description: 'Buka menu motos event aktif.',
        url: '/quick/motos',
        icons: [{ src: '/icon.png', sizes: '512x512', type: 'image/png' }],
      },
      {
        name: 'Checker',
        short_name: 'Checker',
        description: 'Buka panel checker.',
        url: '/jc',
        icons: [{ src: '/icon.png', sizes: '512x512', type: 'image/png' }],
      },
      {
        name: 'Jury Finish',
        short_name: 'Finish',
        description: 'Buka panel finisher.',
        url: '/jury/finish',
        icons: [{ src: '/icon.png', sizes: '512x512', type: 'image/png' }],
      },
    ],
  }
}
