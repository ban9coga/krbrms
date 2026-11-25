import Link from 'next/link'
import type { Metadata } from 'next'
import MarketingTopbar from '../../components/MarketingTopbar'
import { getPublicFinishedEventArchives } from '../../services/publicFinishedEventArchive'
import {
  SITE_INSTAGRAM_DM_URL,
  SITE_INSTAGRAM_URL,
  SITE_WHATSAPP_DISPLAY,
  SITE_WHATSAPP_URL,
  SITE_URL,
} from '../../lib/structuredData'

const pageTitle = 'Sistem Pendaftaran & Digital Scoring Pushbike untuk EO | RacePushbike'
const pageDescription = 'Kelola event pushbike dengan pendaftaran online dan QR code, komunikasi WhatsApp, drawing batch, scoring paperless, aturan fleksibel per event, serta e-sertifikat.'

export const metadata: Metadata = {
  title: { absolute: pageTitle },
  description: pageDescription,
  alternates: { canonical: `${SITE_URL}/untuk-panitia` },
  openGraph: {
    title: pageTitle,
    description: pageDescription,
    url: `${SITE_URL}/untuk-panitia`,
    siteName: 'RacePushbike',
    locale: 'id_ID',
    type: 'website',
    images: [{
      url: '/og-racepushbike.png',
      width: 1200,
      height: 630,
      alt: 'RacePushbike, sistem pendaftaran dan digital scoring untuk event pushbike',
    }],
  },
  twitter: {
    card: 'summary_large_image',
    title: pageTitle,
    description: pageDescription,
    images: ['/og-racepushbike.png'],
  },
}

const features = [
  {
    title: 'Pendaftaran online + QR code',
    description: 'Wali mengisi data rider dan memilih kategori secara online. Sistem mengirim email status pendaftaran beserta QR untuk akses status dan kebutuhan check-in.',
    href: '/registration-status',
    link: 'Cek status pendaftaran',
  },
  {
    title: 'Konfirmasi & laporan via WhatsApp',
    description: 'Konfirmasi status dan QR dikirim lewat email. Unduh laporan registrasi dari dashboard, lalu bagikan kepada tim atau wali rider melalui WhatsApp panitia.',
    href: '/untuk-panitia',
    link: 'Konsultasi pengaturan event',
  },
  {
    title: 'Cek status pendaftaran + konfirmasi kehadiran',
    description: 'Wali dapat membuka status pendaftaran dan menyatakan kehadiran. Panitia dapat memindai QR untuk check-in saat hari lomba.',
    href: '/registration-status',
    link: 'Buka cek status',
  },
  {
    title: 'Digital Scoring Room (paperless)',
    description: 'Checker, finisher, jury, dan RD bekerja melalui panel digital; hasil race dapat dilihat publik melalui Live Score.',
    href: '/live-results',
    link: 'Lihat Live Score',
  },
  {
    title: 'Aturan fleksibel per event + stage otomatis',
    description: 'Atur format dan aturan kategori untuk setiap event. Setelah hasil tahap sumber siap dan dihitung, sistem membuat stage lanjutan sesuai konfigurasi.',
    href: '/untuk-panitia',
    link: 'Tanyakan alur stage',
  },
  {
    title: 'Bundling event + cetak e-sertifikat',
    description: 'Tawarkan pendaftaran event pasangan dalam satu alur, dengan biaya dasar paket dan pendaftaran terhubung per event. Sertifikat yang tersedia dapat dibuat sebagai PDF dengan QR verifikasi.',
    href: '/jadwal-race-pushbike',
    link: 'Lihat event',
  },
]

const steps = [
  ['Siapkan', 'Atur kategori, biaya, bundling event, regulasi, dan kontak WhatsApp. Pendaftaran online mengirim akses status serta QR code melalui email.'],
  ['Jalankan', 'Gunakan drawing batch, gate, dan Digital Scoring Room. Sistem menyesuaikan regulasi masing-masing event dan sistem otomatis membuat stage setelah hasil tahap dihitung.'],
  ['Bagikan', 'Bagikan Live Score dan tautan cek status pendaftaran. Wali dapat melakukan konfirmasi kehadiran; panitia memeriksa QR saat check-in dan mencetak e-sertifikat yang diaktifkan.'],
]

const roles = [
  ['Panitia event', 'Mengatur event, kategori, pendaftaran, drawing, bundling, serta informasi yang tampil kepada peserta.'],
  ['Checker & finisher', 'Mencatat kesiapan rider dan hasil melalui panel kerja sesuai peran.'],
  ['Race Director', 'Memantau race day dan menangani keputusan maupun penalti sesuai konfigurasi event.'],
]

const whatsappConsultUrl = `${SITE_WHATSAPP_URL}?text=${encodeURIComponent('Halo RacePushbike, saya ingin konsultasi tentang sistem untuk event pushbike.')}`

export default async function UntukPanitiaPage() {
  const archives = await getPublicFinishedEventArchives()
  const archivedRiderCount = archives.reduce((total, archive) => total + archive.riderTotal, 0)
  const archivedLocationCount = new Set(archives.map((archive) => archive.event.location?.trim()).filter(Boolean)).size
  const hasArchiveProof = archives.length > 0

  return (
    <div className="public-organizer-page min-h-screen overflow-x-clip bg-[#f5ecd7] text-[#1d0d07]">
      <MarketingTopbar variant="editorial" />

      <main className="mx-auto w-full max-w-6xl px-4 pb-16 pt-5 sm:px-6 sm:pt-8">
        <section className="relative overflow-hidden rounded-[28px] border border-[#5a4032] bg-[radial-gradient(ellipse_at_top_right,_rgba(154,59,22,0.56),_transparent_48%),linear-gradient(135deg,#1d0d07,#2a160d_68%,#451b0d)] px-5 py-7 text-[#fff8e8] shadow-[0_24px_60px_rgba(55,23,9,0.2)] sm:px-10 sm:py-12">
          <div className="relative z-10 max-w-3xl">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#f4c63d]">Untuk komunitas dan penyelenggara</p>
            <h1 className="mt-3 font-[var(--font-display)] text-4xl leading-[1.08] sm:text-6xl">
              Pendaftaran paperless, komunikasi jelas, scoring race dalam satu sistem.
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-[#eadcca] sm:text-base sm:leading-7">
              Kelola pendaftaran online dengan QR, gunakan WhatsApp untuk kanal informasi event, dan jalankan drawing serta scoring mengikuti regulasi masing-masing event.
            </p>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <a href={whatsappConsultUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-12 w-full items-center justify-center rounded-full bg-[#f4c63d] px-6 text-sm font-black text-[#1d0d07] transition-colors hover:bg-[#ffda61] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#fff8e8] sm:w-auto">
                Konsultasi via WhatsApp
              </a>
              <a href={SITE_INSTAGRAM_DM_URL} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-12 w-full items-center justify-center rounded-full border border-[#8b6a55] bg-[#1d0d07]/40 px-6 text-sm font-bold text-[#fff8e8] transition-colors hover:bg-[#3a2116] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f4c63d] sm:w-auto">
                Chat via Instagram
              </a>
            </div>
            <p className="mt-3 text-xs font-semibold text-[#d8c4ad]">
              WhatsApp {SITE_WHATSAPP_DISPLAY}
              <span className="px-2 text-[#8b6a55]" aria-hidden="true">·</span>
              <Link href="/login" className="underline decoration-[#8b6a55] underline-offset-4 hover:text-[#f4c63d]">Sudah punya akun? Masuk</Link>
            </p>
          </div>
        </section>

        <section className="py-8 sm:py-12" aria-labelledby="organizer-features-title">
          <div className="max-w-2xl">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-[#9a3b16]">Dari pendaftaran sampai race day</p>
            <h2 id="organizer-features-title" className="mt-2 font-[var(--font-display)] text-3xl leading-tight sm:text-4xl">Fitur andalan RacePushbike</h2>
          </div>
          <div className="mt-5 grid grid-cols-1 gap-3 sm:mt-6 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
            {features.map((feature, index) => (
              <article key={feature.title} className="organizer-light-surface min-w-0 rounded-2xl border border-[#d9c9ae] bg-[#fff8e8] p-4 shadow-[0_10px_28px_rgba(71,32,12,0.07)] sm:p-5">
                <span className="inline-flex h-8 min-w-8 items-center justify-center rounded-full bg-[#f4c63d] px-2 text-xs font-black text-[#1d0d07]">{String(index + 1).padStart(2, '0')}</span>
                <h3 className="mt-3 font-[var(--font-display)] text-xl leading-tight">{feature.title}</h3>
                <p className="organizer-muted-copy mt-2 text-sm leading-6 text-[#5f4638]">{feature.description}</p>
                <Link href={feature.href} className="mt-4 inline-flex min-h-11 items-center font-bold text-sm text-[#6d2b13] underline decoration-[#b99b78] underline-offset-4">{feature.link} <span className="ml-1" aria-hidden="true">→</span></Link>
              </article>
            ))}
          </div>
        </section>

        {hasArchiveProof ? (
          <section className="mb-8 rounded-2xl border border-[#d9c9ae] bg-[#efe2c7] p-4 sm:mb-10 sm:p-5" aria-label="Data arsip event publik">
            <p className="text-xs font-black uppercase tracking-[0.12em] text-[#9a3b16]">Bukti dari arsip event publik</p>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div><strong className="block text-2xl font-black">{archives.length.toLocaleString('id-ID')}</strong><span className="text-sm">event selesai tersimpan</span></div>
              <div><strong className="block text-2xl font-black">{archivedRiderCount.toLocaleString('id-ID')}</strong><span className="text-sm">rider tercatat di arsip</span></div>
              <div className="col-span-2 sm:col-span-1"><strong className="block text-2xl font-black">{archivedLocationCount.toLocaleString('id-ID')}</strong><span className="text-sm">lokasi event tercatat</span></div>
            </div>
          </section>
        ) : null}

        <section className="organizer-light-surface rounded-3xl border border-[#d9c9ae] bg-[#efe2c7] p-5 sm:p-8" aria-labelledby="organizer-flow-title">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-[#9a3b16]">Cara kerja</p>
          <h2 id="organizer-flow-title" className="mt-2 font-[var(--font-display)] text-3xl leading-tight sm:text-4xl">Siapkan, jalankan, lalu bagikan hasil.</h2>
          <div className="mt-6 grid gap-5 md:grid-cols-3">
            {steps.map(([title, description], index) => (
              <div key={title} className="flex min-w-0 gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#1d0d07] text-sm font-black text-[#f4c63d]">{index + 1}</span>
                <div className="min-w-0"><h3 className="font-extrabold">{title}</h3><p className="organizer-muted-copy mt-1 text-sm leading-6 text-[#5f4638]">{description}</p></div>
              </div>
            ))}
          </div>
        </section>

        <section className="py-8 sm:py-12" aria-labelledby="organizer-roles-title">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-[#9a3b16]">Untuk seluruh kru</p>
          <h2 id="organizer-roles-title" className="mt-2 font-[var(--font-display)] text-3xl leading-tight sm:text-4xl">Alur kerja sesuai peran tim.</h2>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {roles.map(([title, description]) => <article key={title} className="organizer-light-surface rounded-2xl border border-[#d9c9ae] bg-[#fff8e8] p-5"><h3 className="font-extrabold">{title}</h3><p className="organizer-muted-copy mt-2 text-sm leading-6 text-[#5f4638]">{description}</p></article>)}
          </div>
        </section>

        <section className="rounded-3xl bg-[#1d0d07] p-5 text-[#fff8e8] shadow-[0_20px_48px_rgba(55,23,9,0.18)] sm:flex sm:items-center sm:justify-between sm:gap-8 sm:p-9" aria-labelledby="organizer-contact-title">
          <div><p className="text-xs font-black uppercase tracking-[0.14em] text-[#f4c63d]">Mulai dari kebutuhan event Anda</p><h2 id="organizer-contact-title" className="mt-2 font-[var(--font-display)] text-3xl leading-tight">Mari bicarakan alur race tim Anda.</h2><p className="mt-2 text-sm text-[#d8c4ad]">Tanyakan demo, pengaturan regulasi, atau kebutuhan pendaftaran.</p></div>
          <div className="mt-5 flex w-full shrink-0 flex-col gap-3 sm:mt-0 sm:w-auto">
            <a href={whatsappConsultUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-12 w-full items-center justify-center rounded-full bg-[#f4c63d] px-5 text-sm font-black text-[#1d0d07] hover:bg-[#ffda61] sm:w-auto">WhatsApp {SITE_WHATSAPP_DISPLAY}</a>
            <a href={SITE_INSTAGRAM_URL} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-12 items-center justify-center text-center text-sm font-bold text-[#eadcca] underline decoration-[#8b6a55] underline-offset-4 hover:text-[#f4c63d]">Instagram RacePushbike</a>
          </div>
        </section>

        <nav className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm font-bold" aria-label="Tautan terkait">
          <Link href="/jadwal-race-pushbike" className="text-[#6d2b13] underline underline-offset-4">Lihat daftar event</Link>
          <Link href="/registration-status" className="text-[#6d2b13] underline underline-offset-4">Cek status pendaftaran</Link>
          <Link href="/live-results" className="text-[#6d2b13] underline underline-offset-4">Lihat Live Score</Link>
        </nav>
      </main>
    </div>
  )
}
