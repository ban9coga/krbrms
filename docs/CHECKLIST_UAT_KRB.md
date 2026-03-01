# Checklist UAT KRB RMS (Test Satu per Satu)

Tanggal: ____________  
Event: ____________  
PIC Test: ____________

Cara pakai:
- Jalankan dari atas ke bawah.
- Tiap item isi status: `PASS` / `FAIL` / `BLOCKED`.
- Jika `FAIL`, tulis bukti singkat di kolom catatan.

## 1. Pre-Flight

- [ ] 1.1 Aplikasi bisa diakses tanpa error (`/`, `/login`, `/admin`)
- [ ] 1.2 Semua role test tersedia (super_admin, admin, race_control, CHECKER, FINISHER, RACE_DIRECTOR, MC)
- [ ] 1.3 Storage foto/dokumen bisa upload
- [ ] 1.4 Build terakhir sukses (local/vercel)

## 2. Public Flow (Landing -> Event -> Register)

- [ ] 2.1 Landing menampilkan daftar event publik
- [ ] 2.2 Klik event membuka halaman detail event yang benar
- [ ] 2.3 Tombol register mengarah ke `/event/[eventId]/register`
- [ ] 2.4 Form rider wajib (nama, DOB, gender, plate) tervalidasi
- [ ] 2.5 Kategori otomatis terdeteksi dari DOB + gender (jika kategori tersedia)
- [ ] 2.6 Upload foto rider berhasil
- [ ] 2.7 Upload dokumen KK/Akte berhasil
- [ ] 2.8 Submit registrasi berhasil dan ada nomor/ID registrasi
- [ ] 2.9 Anti duplikasi plate bekerja (muncul warning/saran suffix)

## 3. Admin - Setup Event

- [ ] 3.1 Admin login berhasil
- [ ] 3.2 Buat event baru berhasil
- [ ] 3.3 Buat kategori (label, gender, year range, quota) berhasil
- [ ] 3.4 Buat/cek moto berhasil
- [ ] 3.5 Schedule race tersimpan
- [ ] 3.6 Settings event tersimpan (harga, rules, modul)
- [ ] 3.7 Event status bisa diubah (`UPCOMING` -> `LIVE` -> `FINISHED`)

## 4. Admin - Registrations & Riders

- [ ] 4.1 Daftar registrasi tampil
- [ ] 4.2 Detail file bukti bisa dibuka
- [ ] 4.3 Approve registrasi membuat rider di event
- [ ] 4.4 Reject registrasi menyimpan alasan
- [ ] 4.5 Halaman riders: tambah rider manual berhasil
- [ ] 4.6 Halaman riders: edit rider berhasil
- [ ] 4.7 Halaman riders: hapus rider (saat event belum LIVE) berhasil
- [ ] 4.8 Warna font form/admin terbaca jelas (tidak pudar)

## 5. Checker (Jury Start)

- [ ] 5.1 Login role CHECKER berhasil
- [ ] 5.2 Topbar menampilkan user/role yang benar
- [ ] 5.3 Gate selector menampilkan event LIVE
- [ ] 5.4 Jika hanya 1 event LIVE + 1 moto LIVE, auto-redirect berjalan
- [ ] 5.5 Pilih moto manual berjalan normal
- [ ] 5.6 Data rider di gate sesuai moto
- [ ] 5.7 Aksi checker (start/ready/check) tersimpan

## 6. Finisher (Jury Finish)

- [ ] 6.1 Login role FINISHER berhasil
- [ ] 6.2 Event + moto terload benar
- [ ] 6.3 Input urutan finish bisa disimpan
- [ ] 6.4 Ganti event tidak membawa data stale dari event sebelumnya
- [ ] 6.5 Refresh data rider hasil berfungsi

## 7. Race Director

- [ ] 7.1 Login role RACE_DIRECTOR berhasil
- [ ] 7.2 Daftar approval tampil
- [ ] 7.3 Approve hasil moto berhasil
- [ ] 7.4 Reject/override penalty berhasil
- [ ] 7.5 Lock/unlock moto sesuai rule berjalan

## 8. Race Control

- [ ] 8.1 Login role race_control berhasil
- [ ] 8.2 Queue/flow race tampil sesuai event LIVE
- [ ] 8.3 Perubahan status dari checker/finisher terbaca di race control

## 9. MC / Public Display

- [ ] 9.1 Login role MC berhasil
- [ ] 9.2 Halaman MC menampilkan event yang dipilih
- [ ] 9.3 Live result tampil update sesuai data terbaru
- [ ] 9.4 Daftar rider “bersiap” tampil sesuai urutan

## 10. Security & Role Access

- [ ] 10.1 Super Admin bisa akses `/admin/users`
- [ ] 10.2 Admin tidak bisa akses endpoint khusus super admin (jika dibatasi)
- [ ] 10.3 Role non-admin tidak bisa akses halaman admin
- [ ] 10.4 Logout menghapus session dan redirect ke login

## 11. Regression Cepat

- [ ] 11.1 Tidak ada console error di halaman utama role-role inti
- [ ] 11.2 Tidak ada teks karakter rusak (encoding aneh)
- [ ] 11.3 Tombol navigasi utama tidak dead-link
- [ ] 11.4 Build `npm run build` sukses setelah perubahan

## 12. Log Hasil Test

| ID | Skenario | Status | Catatan Bug | PIC | Timestamp |
|---|---|---|---|---|---|
|  |  | PASS/FAIL/BLOCKED |  |  |  |
|  |  | PASS/FAIL/BLOCKED |  |  |  |
|  |  | PASS/FAIL/BLOCKED |  |  |  |

## 13. Keputusan Simulasi

- [ ] GO (siap operasional)
- [ ] NO GO (perlu perbaikan dulu)

Catatan final:  
__________________________________________________________________  
__________________________________________________________________

