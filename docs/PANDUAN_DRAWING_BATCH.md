# Panduan Drawing Batch

Panduan ini untuk Admin, Super Admin, atau Drawing Manager yang mendapat assignment event. Gunakan halaman **Drawing Batch** untuk mengacak urutan gate rider dan membuat Moto 1 serta Moto 2 per kategori.

## 1. Fungsi Drawing Batch

Drawing Batch dipakai sebelum race dimulai untuk:

- membagi rider ke dalam batch;
- menentukan urutan gate Moto 1 secara acak;
- membuat urutan gate Moto 2 sesuai pengaturan event, biasanya dibalik otomatis;
- menyimpan hasilnya menjadi moto yang nantinya dipakai checker dan finisher.

Hasil draw **belum membuat moto LIVE**. Setelah disimpan, moto berstatus `UPCOMING` dan tetap harus dipersiapkan checker melalui alur race day.

## 2. Sebelum Mulai

Pastikan hal berikut sudah dilakukan oleh Admin Event:

1. Event sudah dibuat dan kategori yang akan didraw sudah aktif.
2. Rider pada kategori tersebut sudah disetujui dan tampil pada daftar rider.
3. Pengaturan draw sudah benar di **Event Settings > Draw Settings**:
   - jumlah gate per batch;
   - cara pembagian batch: otomatis, jumlah batch manual, atau ukuran batch khusus;
   - urutan Moto 2: sama atau dibalik dari Moto 1.
4. Anda sudah mendapat assignment sebagai `DRAW_MANAGER`, `ADMIN`, atau `SUPER_ADMIN` untuk event tersebut.

Jangan mulai drawing bila daftar rider masih berubah. Tambah, hapus, atau pindah kategori rider lebih aman diselesaikan terlebih dahulu.

## 3. Masuk ke Halaman Drawing

1. Buka halaman login RacePushbike.
2. Masuk memakai email dan password, atau kode crew dan PIN yang diberikan panitia.
3. Akun Drawing Manager akan masuk ke halaman **Pilih Event untuk mulai drawing**.
4. Pilih event yang ditugaskan, lalu halaman **Drawing Batch** akan terbuka.

Jika tidak melihat event yang seharusnya dikerjakan, minta Admin memeriksa assignment akun dan status aktif event.

## 4. Alur Drawing Normal

### Langkah 1: Pilih kategori

1. Tekan pilihan kategori di bagian atas halaman.
2. Pilih kategori yang akan didraw, misalnya `2023-2024 Mix`.
3. Periksa informasi yang muncul:
   - jumlah rider pada kategori;
   - jumlah batch Moto 1;
   - aturan Moto 2, misalnya `Dibalik otomatis`.

Gunakan tombol muat ulang bila Admin baru saja memperbaiki daftar rider atau konfigurasi draw.

### Langkah 2: Jalankan Spin Draw

1. Pastikan kategori dan jumlah rider sudah benar.
2. Tekan **Spin Draw** satu kali.
3. Tunggu animasi selesai. Sistem akan menampilkan hasil pembagian rider di panel **Draw Result**.
4. Periksa setiap batch dan gate pada Moto 1.

Urutan yang muncul merupakan hasil acak. Moto 2 akan dibuat berdasarkan aturan yang sudah dipilih Admin pada Draw Settings.

### Langkah 3: Ulangi bila belum sesuai

Selama hasil belum disimpan, tekan **Ulangi Draw** untuk mengacak ulang seluruh kategori. Tidak ada data moto yang berubah pada tahap ini.

Gunakan ulang draw hanya bila memang diperlukan, misalnya ada kesalahan daftar rider atau panitia sepakat mengulang undian. Setelah hasil sudah cocok, lanjutkan ke penyimpanan.

### Langkah 4: Simpan sebagai moto

1. Tekan **Save as Moto**.
2. Akan muncul modal **Menyimpan moto kategori**. Tunggu sampai proses selesai dan jangan menutup atau me-refresh halaman.
3. Saat data sudah tersimpan dan dimuat ulang, modal **Moto kategori telah disimpan** muncul.
4. Dari modal ini, pilih salah satu tindakan:
   - **Download Excel** untuk menyimpan daftar gate;
   - **Next: [nama kategori]** untuk melanjutkan draw kategori berikutnya;
   - **Tutup** untuk tetap di kategori saat ini.

Sesudah tersimpan, sistem membuat moto untuk seluruh batch pada kategori tersebut. Contoh: `Moto 1 - Batch 1`, `Moto 1 - Batch 2`, dan seterusnya, berikut Moto 2 bila format event memakainya.

## 5. Setelah Drawing Disimpan

Kategori yang sudah disimpan akan dianggap sudah didraw. Pada halaman Drawing, hasilnya dapat dilihat kembali sebagai daftar moto dan gate.

Langkah berikutnya dilakukan oleh tim race day:

1. Admin memeriksa moto dan urutan moto di menu **Motos** atau **Moto Sequence**.
2. Checker menyiapkan rider dan safety pada moto yang akan berjalan.
3. Checker menekan **Moto Ready** setelah rider siap.
4. Finisher mengisi hasil ketika moto sudah `LIVE`.

Drawing hanya mengatur pembagian batch dan gate awal. Drawing tidak menentukan hasil race, rank, penalty, DNS, atau DNF.

## 6. Jika Memakai External Order

Beberapa event menggunakan mode **External Order**. Mode ini digunakan bila urutan rider sudah ditentukan dari luar sistem, misalnya berdasarkan undian fisik atau daftar panitia.

1. Pilih kategori.
2. Masukkan atau tempatkan rider pada batch dan Moto 1 yang benar.
3. Jika Moto 2 diatur manual, masukkan juga urutan Moto 2 dengan rider yang sama pada batch yang sama.
4. Pastikan setiap rider hanya muncul satu kali dan seluruh slot sudah terisi.
5. Tekan **Gunakan Urutan External**, lalu periksa hasil.
6. Tekan **Save as Moto** bila susunan sudah benar.

Sistem akan menolak penyimpanan jika ada rider ganda, rider belum ditempatkan, atau susunan Moto 2 tidak valid.

## 7. Koreksi Kesalahan

| Kondisi | Tindakan yang benar |
| --- | --- |
| Salah pilih kategori, belum menekan Save as Moto | Pilih kategori yang benar. Tidak ada data moto yang berubah. |
| Hasil acak belum cocok, belum disimpan | Tekan **Ulangi Draw**, lalu lakukan Spin Draw kembali. |
| Rider baru ditambahkan sebelum moto disimpan | Tekan muat ulang, periksa jumlah rider, lalu draw kembali. |
| Hasil sudah tersimpan tetapi belum dipakai race | Minta Admin atau Race Director menggunakan **Reset Draw (Hapus Moto)** bila tombol tersedia. Setelah itu lakukan draw ulang. |
| Tombol reset tidak bisa dipakai | Moto sudah punya data race atau terkait data lain. Jangan menghapus sendiri; koordinasikan dengan Race Director. |
| Rider sudah diproses checker/finisher | Jangan reset drawing. Gunakan alur koreksi race yang disetujui Race Director. |

## 8. Checklist Sebelum Menekan Save as Moto

- Kategori yang dipilih sudah benar.
- Jumlah rider sama dengan daftar rider yang disetujui.
- Jumlah batch sesuai pengaturan event.
- Tidak ada rider yang tertinggal atau muncul dua kali.
- Panitia sudah menyetujui hasil undian.
- Jika dibutuhkan, hasil preview sudah didokumentasikan atau ditampilkan ke peserta.

## 9. Tips Saat Ditampilkan ke Proyektor

- Gunakan browser layar penuh agar area Draw Result terbaca jelas.
- Pastikan koneksi stabil sebelum menekan Spin Draw dan Save as Moto.
- Jangan menekan tombol Spin Draw berulang saat animasi masih berjalan.
- Unduh Excel setelah penyimpanan selesai sebagai arsip panitia.
- Simpan hasil draw per kategori sebelum beralih ke kategori berikutnya.

## 10. Ringkasan Cepat

`Pilih Event` -> `Pilih Kategori` -> `Spin Draw` -> `Periksa Draw Result` -> `Ulangi Draw bila perlu` -> `Save as Moto` -> `Tunggu modal sukses` -> `Download Excel atau lanjut kategori berikutnya`.

Jika ada masalah data rider, hentikan proses sebelum menekan **Save as Moto** dan hubungi Admin Event atau Race Director.
