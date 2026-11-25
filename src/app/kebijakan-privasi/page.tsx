import type { Metadata } from 'next'
import MarketingTopbar from '../../components/MarketingTopbar'
import { SITE_URL, SITE_WHATSAPP_URL } from '../../lib/structuredData'

export const metadata: Metadata = {
  title: 'Kebijakan Privasi | RacePushbike',
  description: 'Informasi tentang data yang diproses RacePushbike untuk pendaftaran dan penyelenggaraan event.',
  alternates: { canonical: `${SITE_URL}/kebijakan-privasi` },
}

export default function KebijakanPrivasiPage() {
  return (
    <div className="public-page homepage-editorial-page">
      <MarketingTopbar variant="editorial" />
      <main className="public-legal-page">
        <header className="public-legal-header">
          <p>KETERBUKAAN DATA</p>
          <h1>Kebijakan Privasi</h1>
          <span>Terakhir diperbarui 25 November 2026</span>
        </header>

        <div className="public-legal-content">
          <p>
            Kebijakan ini menjelaskan data yang diproses melalui RacePushbike.com saat wali mendaftarkan rider,
            panitia mengelola event, dan hasil race ditampilkan. Karena banyak rider masih anak-anak, pendaftaran
            dan permintaan terkait data rider harus dilakukan oleh orang tua atau wali yang berwenang.
          </p>

          <section>
            <h2>Data yang dapat diproses</h2>
            <ul>
              <li>Data wali: nama, nomor telepon, alamat email jika diberikan, serta informasi komunitas/klub.</li>
              <li>Data rider: nama dan nama panggilan, tanggal lahir, jenis kelamin, klub, ukuran jersey, nomor plat yang diminta, dan foto jika diminta oleh formulir event.</li>
              <li>Data administrasi event: kategori, status pendaftaran, biaya, catatan pendaftaran, serta hasil dan peringkat race.</li>
              <li>Dokumen pendaftaran yang diunggah, seperti Kartu Keluarga, akta kelahiran, atau KIA, dan bukti pembayaran serta informasi pembayaran yang diserahkan.</li>
              <li>Informasi teknis dasar yang diperlukan agar situs dan fitur keamanan berfungsi.</li>
            </ul>
          </section>

          <section>
            <h2>Tujuan penggunaan</h2>
            <p>
              Data digunakan untuk memproses pendaftaran, memeriksa kelayakan kategori, menghubungi wali tentang
              pendaftaran atau pembayaran, mengatur kebutuhan race, mencatat hasil, menerbitkan sertifikat, dan
              menindaklanjuti kendala atau permintaan data.
            </p>
          </section>

          <section>
            <h2>Akses dan tampilan publik</h2>
            <p>
              Panitia event dan petugas yang diberi akses dapat melihat data yang diperlukan untuk tugas mereka.
              Pada event publik, informasi race seperti nama rider, nomor plat, klub, kategori, peringkat, dan hasil
              dapat ditampilkan di halaman event atau hasil. Dokumen identitas dan bukti pembayaran tidak dimaksudkan
              untuk ditampilkan pada halaman hasil publik.
            </p>
          </section>

          <section>
            <h2>Penyimpanan dan penghapusan</h2>
            <p>
              Data disimpan selama diperlukan untuk pendaftaran, pelaksanaan dan arsip hasil event, sertifikat,
              penanganan sengketa, serta kewajiban administrasi yang berlaku. Orang tua atau wali dapat meminta salinan,
              koreksi, atau penghapusan data rider melalui kontak di bawah. Kami akan memverifikasi kewenangan pemohon;
              penghapusan dapat dibatasi bila sebagian catatan masih diperlukan untuk kewajiban hukum, pembayaran,
              integritas hasil, atau penyelesaian masalah event. Jika ada bagian yang tidak dapat dihapus, alasannya
              akan dijelaskan kepada pemohon.
            </p>
          </section>

          <section>
            <h2>Penyedia layanan</h2>
            <p>
              Data dapat diproses oleh penyedia layanan teknologi yang membantu menjalankan situs, menyimpan data,
              mengirim notifikasi, dan menyajikan media. Akses dibatasi sesuai kebutuhan operasional. RacePushbike
              tidak menjual data pribadi rider atau wali.
            </p>
          </section>

          <section>
            <h2>Permintaan dan kontak</h2>
            <p>
              Untuk meminta akses, koreksi, atau penghapusan data, hubungi RacePushbike melalui WhatsApp. Sertakan kode
              pendaftaran atau informasi event dan jelaskan permintaannya; jangan kirim dokumen identitas tambahan
              kecuali diminta untuk proses verifikasi yang aman.
            </p>
            <a href={SITE_WHATSAPP_URL} target="_blank" rel="noopener noreferrer">Hubungi RacePushbike</a>
          </section>

          <p className="public-legal-note">
            Kebijakan ini menjelaskan praktik produk secara umum dan bukan pengganti nasihat hukum. Informasi mengenai
            hak subjek data tersedia dalam{' '}
            <a href="https://peraturan.bpk.go.id/Details/229798/uu-no-27-tahun-2022" target="_blank" rel="noopener noreferrer">
              Undang-Undang Pelindungan Data Pribadi
            </a>.
          </p>
        </div>
      </main>
    </div>
  )
}
