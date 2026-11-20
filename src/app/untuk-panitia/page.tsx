import Link from 'next/link'
import MarketingTopbar from '../../components/MarketingTopbar'
import { SITE_INSTAGRAM_DM_URL, SITE_INSTAGRAM_URL } from '../../lib/structuredData'

export const metadata = {
  title: 'Untuk Panitia | RacePushbike',
  description: 'Informasi sistem RacePushbike untuk panitia penyelenggara race pushbike.',
}

export default function UntukPanitiaPage() {
  return (
    <div className="min-h-screen bg-[#f5ecd7] text-[#1d0d07]">
      <MarketingTopbar variant="editorial" />
      <main className="mx-auto grid min-h-[calc(100svh-72px)] w-full max-w-5xl place-items-center px-4 py-10 sm:px-6">
        <section className="w-full overflow-hidden rounded-3xl border border-[#5a4032] bg-[#1d0d07] px-6 py-9 text-[#fff8e8] shadow-2xl sm:px-10 sm:py-12">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[#f4c63d]">Untuk Panitia</p>
          <h1 className="mt-3 max-w-3xl font-[var(--font-display)] text-4xl leading-tight sm:text-5xl">
            Kelola race pushbike dalam satu sistem.
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-[#eadcca] sm:text-base">
            Atur event, pendaftaran, jadwal, dan hasil race melalui sistem RacePushbike. Masuk untuk membuka panel sesuai akses panitia.
          </p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/login"
              className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#f4c63d] px-6 text-sm font-black text-[#1d0d07] transition-colors hover:bg-[#ffd95c]"
            >
              Masuk ke sistem panitia
            </Link>
            <Link
              href="/jadwal-race-pushbike"
              className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#8b6a55] px-6 text-sm font-bold text-[#fff8e8] transition-colors hover:bg-[#2a160d]"
            >
              Lihat daftar event
            </Link>
          </div>
          <div className="mt-8 border-t border-[#5a4032] pt-6">
            <h2 className="text-base font-black text-[#fff8e8]">Hubungi panitia RacePushbike</h2>
            <div className="mt-3 flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:gap-5">
              <a
                href={SITE_INSTAGRAM_DM_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#f4c63d] px-5 text-sm font-black text-[#1d0d07] transition-colors hover:bg-[#ffd95c]"
              >
                Chat via Instagram
              </a>
              <a
                href={SITE_INSTAGRAM_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center text-sm font-bold text-[#eadcca] underline decoration-[#8b6a55] underline-offset-4 transition-colors hover:text-[#f4c63d]"
              >
                Lihat Instagram kami
              </a>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}
