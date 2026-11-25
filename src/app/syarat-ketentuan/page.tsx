import type { Metadata } from 'next'
import MarketingTopbar from '../../components/MarketingTopbar'
import { SITE_URL, SITE_WHATSAPP_URL } from '../../lib/structuredData'

export const metadata: Metadata = {
  title: 'Syarat & Ketentuan | RacePushbike',
  description: 'Ketentuan penggunaan RacePushbike.com untuk pendaftaran dan informasi event pushbike.',
  alternates: { canonical: `${SITE_URL}/syarat-ketentuan` },
}

export default function SyaratKetentuanPage() {
  return (
    <div className="public-page homepage-editorial-page">
      <MarketingTopbar variant="editorial" />
      <main className="public-legal-page">
        <header className="public-legal-header">
          <p>PENGGUNAAN PLATFORM</p>
          <h1>Syarat &amp; Ketentuan</h1>
          <span>Terakhir diperbarui 25 November 2026</span>
        </header>

        <div className="public-legal-content">
          <p>
            Dengan menggunakan RacePushbike.com, pengguna menyetujui ketentuan berikut untuk fitur informasi event,
            pendaftaran, live score, dan hasil race.
          </p>

          <section>
            <h2>Informasi event dan aturan lomba</h2>
            <p>
              Detail jadwal, kategori, biaya, kuota, regulasi, dan keputusan lomba ditetapkan oleh penyelenggara event.
              Periksa informasi event dan hubungi panitia jika ada perbedaan atau pertanyaan. RacePushbike menyediakan
              perangkat untuk pengelolaan dan penyajian informasi event.
            </p>
          </section>

          <section>
            <h2>Pendaftaran rider</h2>
            <p>
              Orang tua atau wali bertanggung jawab memastikan data yang dimasukkan benar dan berwenang mendaftarkan
              rider. Pendaftaran, kategori, biaya, pembayaran, dan kelengkapan dokumen mengikuti ketentuan event yang
              dipilih. Pendaftaran belum dianggap disetujui sebelum statusnya diperbarui oleh panitia.
            </p>
          </section>

          <section>
            <h2>Hasil dan sertifikat</h2>
            <p>
              Hasil yang tampil mengikuti data yang dicatat dan disahkan melalui alur event. Jika menemukan kesalahan,
              sampaikan kepada panitia event untuk ditinjau. Sertifikat elektronik hanya berlaku sesuai informasi
              verifikasi yang disediakan pada sertifikat.
            </p>
          </section>

          <section>
            <h2>Penggunaan yang wajar</h2>
            <p>
              Pengguna tidak boleh mengirim data palsu, mengakses data yang bukan haknya, mengganggu layanan, atau
              menggunakan platform untuk tujuan yang melanggar hukum. Jangan membagikan kode pendaftaran atau tautan
              akses pribadi kepada pihak yang tidak berwenang.
            </p>
          </section>

          <section>
            <h2>Perubahan layanan dan ketentuan</h2>
            <p>
              Fitur dapat diperbarui untuk menjaga layanan dan menyesuaikan kebutuhan event. Perubahan syarat akan
              dipublikasikan pada halaman ini. Ketentuan khusus dari penyelenggara tetap berlaku untuk event tersebut.
            </p>
          </section>

          <section>
            <h2>Kontak</h2>
            <p>Untuk pertanyaan tentang penggunaan platform, hubungi RacePushbike melalui WhatsApp.</p>
            <a href={SITE_WHATSAPP_URL} target="_blank" rel="noopener noreferrer">Hubungi RacePushbike</a>
          </section>
        </div>
      </main>
    </div>
  )
}
