import Link from 'next/link'
import MarketingTopbar from '../../components/MarketingTopbar'
import {
  SITE_INSTAGRAM_DM_URL,
  SITE_INSTAGRAM_URL,
  SITE_WHATSAPP_DISPLAY,
  SITE_WHATSAPP_URL,
} from '../../lib/structuredData'

export const metadata = {
  title: 'Untuk Komunitas & EO | RacePushbike',
  description: 'Kelola pendaftaran, drawing, race day, dan hasil pushbike melalui satu sistem RacePushbike.',
}

const featureGroups = [
  {
    number: '01',
    title: 'Siapkan event dan pendaftaran',
    description: 'Atur kategori, batas peserta, biaya, dan informasi event dalam satu tempat.',
    items: ['Pendaftaran rider online', 'Kategori tahun lahir atau usia', 'Info biaya, bundling, dan racepack'],
  },
  {
    number: '02',
    title: 'Jalankan race day dengan teratur',
    description: 'Siapkan urutan race dan bantu kru bekerja dengan tampilan sesuai tugasnya.',
    items: ['Drawing batch, gate, dan moto', 'Urutan moto per kategori', 'Alur kerja checker, finisher, dan RD'],
  },
  {
    number: '03',
    title: 'Bagikan hasil dengan cepat',
    description: 'Pantau pergerakan hasil dari meja panitia hingga halaman yang dibuka keluarga rider.',
    items: ['Pencatatan status dan penalti', 'Perhitungan stage dan kelas sesuai aturan', 'Live score dan e-sertifikat QR'],
  },
]

const steps = [
  ['Atur', 'Masukkan informasi event, kategori, aturan, dan kebutuhan pendaftaran.'],
  ['Jalankan', 'Siapkan drawing lalu gunakan panel kerja sesuai peran kru saat race day.'],
  ['Bagikan', 'Tampilkan hasil race secara publik dan terbitkan e-sertifikat.'],
]

const roles = [
  ['Panitia event', 'Mengatur event, kategori, pendaftaran, drawing, dan hasil.'],
  ['Checker & finisher', 'Membantu mencatat kesiapan rider dan hasil race sesuai tugas.'],
  ['Race Director', 'Memantau race day serta menangani keputusan dan penalti.'],
]

const whatsappConsultUrl = `${SITE_WHATSAPP_URL}?text=${encodeURIComponent('Halo RacePushbike, saya ingin konsultasi tentang sistem untuk event pushbike.')}`

export default function UntukPanitiaPage() {
  return (
    <div className="public-organizer-page min-h-screen bg-[#f5ecd7] text-[#1d0d07]">
      <MarketingTopbar variant="editorial" />

      <main className="mx-auto w-full max-w-6xl px-4 pb-16 pt-5 sm:px-6 sm:pt-8">
        <section className="relative overflow-hidden rounded-[28px] border border-[#5a4032] bg-[radial-gradient(ellipse_at_top_right,_rgba(154,59,22,0.56),_transparent_48%),linear-gradient(135deg,#1d0d07,#2a160d_68%,#451b0d)] px-5 py-8 text-[#fff8e8] shadow-[0_24px_60px_rgba(55,23,9,0.2)] sm:px-10 sm:py-12">
          <div className="relative z-10 max-w-3xl">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#f4c63d]">Untuk komunitas dan penyelenggara</p>
            <h1 className="mt-3 font-[var(--font-display)] text-4xl leading-[1.02] sm:text-6xl">
              Dari pendaftaran sampai hasil race, kelola dalam satu sistem.
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-[#eadcca] sm:text-base sm:leading-7">
              RacePushbike membantu tim menyiapkan event, mengatur drawing, menjalankan race day, dan membagikan hasil kepada keluarga rider.
            </p>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <a
                href={whatsappConsultUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-12 items-center justify-center rounded-full bg-[#f4c63d] px-6 text-sm font-black text-[#1d0d07] transition-colors hover:bg-[#ffda61] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#fff8e8]"
              >
                Konsultasi via WhatsApp
              </a>
              <a
                href={SITE_INSTAGRAM_DM_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-12 items-center justify-center rounded-full border border-[#8b6a55] bg-[#1d0d07]/40 px-6 text-sm font-bold text-[#fff8e8] transition-colors hover:bg-[#3a2116] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f4c63d]"
              >
                Chat via Instagram
              </a>
            </div>
            <p className="mt-3 text-xs font-semibold text-[#d8c4ad]">
              WhatsApp {SITE_WHATSAPP_DISPLAY}
              <span className="px-2 text-[#8b6a55]" aria-hidden="true">·</span>
              <Link href="/login" className="underline decoration-[#8b6a55] underline-offset-4 hover:text-[#f4c63d]">Sudah punya akun? Masuk</Link>
            </p>
          </div>

          <div className="relative z-10 mt-9 grid grid-cols-3 gap-2 border-t border-[#5a4032] pt-5 text-center sm:max-w-2xl sm:gap-4">
            {['Pendaftaran', 'Race day', 'Hasil publik'].map((item) => (
              <div key={item} className="rounded-xl bg-[#fff8e8]/[0.06] px-2 py-3 text-xs font-extrabold text-[#fff8e8] sm:text-sm">
                {item}
              </div>
            ))}
          </div>
        </section>

        <section className="py-10 sm:py-14" aria-labelledby="organizer-features-title">
          <div className="max-w-2xl">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-[#9a3b16]">Fitur untuk seluruh alur race</p>
            <h2 id="organizer-features-title" className="mt-2 font-[var(--font-display)] text-3xl leading-tight sm:text-4xl">
              Satu alur kerja untuk tim dan peserta.
            </h2>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {featureGroups.map((group) => (
              <article key={group.number} className="organizer-light-surface rounded-2xl border border-[#d9c9ae] bg-[#fff8e8] p-5 shadow-[0_10px_28px_rgba(71,32,12,0.07)] sm:p-6">
                <span className="inline-flex h-9 min-w-9 items-center justify-center rounded-full bg-[#f4c63d] px-3 text-xs font-black text-[#1d0d07]">{group.number}</span>
                <h3 className="mt-4 font-[var(--font-display)] text-xl leading-tight">{group.title}</h3>
                <p className="organizer-muted-copy mt-2 text-sm leading-6 text-[#5f4638]">{group.description}</p>
                <ul className="mt-4 grid gap-2">
                  {group.items.map((item) => (
                    <li key={item} className="organizer-item-copy flex gap-2 text-sm leading-5 text-[#342116]">
                      <span aria-hidden="true" className="font-black text-[#9a3b16]">✓</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>

        <section className="organizer-light-surface rounded-3xl border border-[#d9c9ae] bg-[#efe2c7] p-5 sm:p-8" aria-labelledby="organizer-flow-title">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-[#9a3b16]">Cara kerja</p>
          <h2 id="organizer-flow-title" className="mt-2 font-[var(--font-display)] text-3xl leading-tight sm:text-4xl">Tiga langkah dari setup ke hasil.</h2>
          <div className="mt-6 grid gap-5 md:grid-cols-3">
            {steps.map(([title, description], index) => (
              <div key={title} className="flex gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#1d0d07] text-sm font-black text-[#f4c63d]">{index + 1}</span>
                <div>
                  <h3 className="font-extrabold">{title}</h3>
                  <p className="organizer-muted-copy mt-1 text-sm leading-6 text-[#5f4638]">{description}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="py-10 sm:py-14" aria-labelledby="organizer-roles-title">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-[#9a3b16]">Untuk seluruh kru</p>
          <h2 id="organizer-roles-title" className="mt-2 font-[var(--font-display)] text-3xl leading-tight sm:text-4xl">Setiap peran punya alur kerja yang jelas.</h2>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {roles.map(([title, description]) => (
              <article key={title} className="organizer-light-surface rounded-2xl border border-[#d9c9ae] bg-[#fff8e8] p-5">
                <h3 className="font-extrabold">{title}</h3>
                <p className="organizer-muted-copy mt-2 text-sm leading-6 text-[#5f4638]">{description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="rounded-3xl bg-[#1d0d07] p-6 text-[#fff8e8] shadow-[0_20px_48px_rgba(55,23,9,0.18)] sm:flex sm:items-center sm:justify-between sm:gap-8 sm:p-9" aria-labelledby="organizer-contact-title">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.14em] text-[#f4c63d]">Mulai dari kebutuhan event Anda</p>
            <h2 id="organizer-contact-title" className="mt-2 font-[var(--font-display)] text-3xl leading-tight">Mari bicarakan alur race yang cocok untuk tim Anda.</h2>
            <p className="mt-2 text-sm text-[#d8c4ad]">Hubungi kami untuk melihat demo dan membahas kebutuhan event.</p>
          </div>
          <div className="mt-5 flex shrink-0 flex-col gap-3 sm:mt-0">
            <a
              href={whatsappConsultUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-12 items-center justify-center rounded-full bg-[#f4c63d] px-5 text-sm font-black text-[#1d0d07] hover:bg-[#ffda61]"
            >
              WhatsApp {SITE_WHATSAPP_DISPLAY}
            </a>
            <a href={SITE_INSTAGRAM_URL} target="_blank" rel="noopener noreferrer" className="text-center text-sm font-bold text-[#eadcca] underline decoration-[#8b6a55] underline-offset-4 hover:text-[#f4c63d]">
              Lihat Instagram RacePushbike
            </a>
          </div>
        </section>

        <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm font-bold">
          <Link href="/jadwal-race-pushbike" className="text-[#6d2b13] underline underline-offset-4">Lihat daftar event</Link>
          <Link href="/live-results" className="text-[#6d2b13] underline underline-offset-4">Lihat Live Score</Link>
        </div>
      </main>
    </div>
  )
}
