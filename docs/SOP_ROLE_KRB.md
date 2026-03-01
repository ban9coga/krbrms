# SOP Operasional Per Role - KRB Race Management System

Tanggal update: 1 Maret 2026 (WIB)

Dokumen ini jadi acuan tugas, batas tanggung jawab, dan alur kerja tiap role di KRB RMS.

## 1. Daftar Role Aktif

- `super_admin`
- `admin`
- `race_control`
- `CHECKER` (alias operasional: `JURY_START`)
- `FINISHER` (alias operasional: `JURY_FINISH`)
- `RACE_DIRECTOR`
- `MC`

## 2. SOP Per Role

### 2.1 Super Admin

Tujuan:
- Menjaga integritas akun, role, dan akses sistem.

Akses utama:
- `/admin/users`

Tugas harian:
1. Buat akun baru staff.
2. Set role user sesuai fungsi lapangan.
3. Ubah role jika ada rotasi personel.
4. Hapus/nonaktifkan akun yang tidak dipakai.
5. Audit akses berisiko tinggi (super admin, director).

Checklist sebelum race:
1. Pastikan semua user inti sudah bisa login.
2. Pastikan role mapping sudah benar.
3. Verifikasi tidak ada akun ganda untuk personel yang sama.

Checklist saat race:
1. Standby untuk issue login dan hak akses.
2. Tindak cepat reset akses bila ada pergantian operator.

Checklist setelah race:
1. Cabut akses temporer.
2. Review akun yang tidak lagi dibutuhkan.

### 2.2 Admin

Tujuan:
- Menyiapkan event end-to-end sampai data siap dipakai tim operasional.

Akses utama:
- `/admin`
- `/admin/events`
- `/admin/events/[eventId]/registrations`
- `/admin/events/[eventId]/riders`
- `/admin/events/[eventId]/categories`
- `/admin/events/[eventId]/live-draw`
- `/admin/events/[eventId]/motos`
- `/admin/events/[eventId]/schedule`
- `/admin/events/[eventId]/results`
- `/admin/events/[eventId]/penalties`
- `/admin/events/[eventId]/settings`

Tugas harian:
1. Buat dan update event.
2. Set kategori, quota, price, dan pengaturan event.
3. Verifikasi pendaftaran publik.
4. Approve/reject registrasi sesuai data dokumen.
5. Sinkron rider dan category assignment.
6. Siapkan moto (draw, pembagian, urutan start).

Checklist sebelum race:
1. Semua kategori aktif dan benar.
2. Quota sudah sesuai kebijakan event.
3. Data rider bersih (plate unik, DOB valid, gender valid).
4. Motos dan schedule siap dipakai checker/finisher.
5. Event status publik sesuai (`UPCOMING`/`LIVE`/`FINISHED`).

Checklist saat race:
1. Pantau perubahan data darurat dari lapangan.
2. Hindari perubahan struktur besar saat event live.

Checklist setelah race:
1. Finalisasi data hasil.
2. Rapikan data yang tidak valid/duplikat.
3. Siapkan event archive.

### 2.3 Race Control

Tujuan:
- Mengontrol jalannya moto dan antrian operasional race day.

Akses utama:
- `/race-control`

Tugas harian:
1. Pantau queue rider per moto.
2. Koordinasi timing start antar tim.
3. Pastikan moto berjalan sesuai urutan event.

Checklist sebelum race:
1. Event dan moto live sesuai jadwal.
2. Komunikasi dengan checker dan finisher siap.

Checklist saat race:
1. Monitor kelancaran flow per moto.
2. Eskalasi ke director jika ada konflik aturan.

Checklist setelah race:
1. Konfirmasi seluruh moto selesai dan status sinkron.

### 2.4 Checker (Jury Start)

Tujuan:
- Validasi rider di gate dan menjalankan proses start.

Akses utama:
- `/jc`
- `/jc/[eventId]/[motoId]`

Tugas harian:
1. Pilih event dan moto aktif di gate selector.
2. Cek kesiapan rider di gate.
3. Verifikasi identitas plate sebelum start.
4. Jalankan start sesuai lane dan urutan yang berlaku.

Checklist sebelum race:
1. Event `LIVE` dan moto target `LIVE`.
2. Daftar rider moto terload penuh.
3. Jalur komunikasi ke race control aktif.

Checklist saat race:
1. Hindari start jika ada mismatch rider.
2. Catat isu gate/safety untuk review penalties bila perlu.

Checklist setelah race:
1. Pastikan moto status berpindah sesuai flow.

### 2.5 Finisher (Jury Finish)

Tujuan:
- Mencatat urutan finish dan menjaga akurasi hasil awal.

Akses utama:
- `/jury/finish`

Tugas harian:
1. Pilih event dan moto.
2. Input urutan finish rider.
3. Validasi no plate dan rider sebelum submit.
4. Koreksi cepat jika ada mismatch input.

Checklist sebelum race:
1. Moto aktif sudah sesuai dari race control/checker.
2. List rider finish siap dimonitor.

Checklist saat race:
1. Input hasil finish secepat mungkin.
2. Pastikan tidak ada rider missing atau plate salah.

Checklist setelah race:
1. Kunci data hasil awal untuk review director.

### 2.6 Race Director

Tujuan:
- Pengambil keputusan final hasil race dan penalty.

Akses utama:
- `/race-director/approval`

Tugas harian:
1. Review hasil moto dari tim finish.
2. Review penalty/protes/override.
3. Set keputusan approve/reject/override.
4. Lock atau unlock moto sesuai kebutuhan governance.

Checklist sebelum race:
1. Rule penalty dan aturan event sudah jelas.
2. Jalur eskalasi ke race control aktif.

Checklist saat race:
1. Fokus ke kasus khusus: protes, pelanggaran, konflik data.
2. Pastikan setiap keputusan punya alasan operasional.

Checklist setelah race:
1. Final approve hasil resmi event.
2. Tutup seluruh tiket keputusan terbuka.

### 2.7 MC

Tujuan:
- Menyampaikan informasi live ke penonton/publik.

Akses utama:
- `/mc/[eventId]`

Tugas harian:
1. Tampilkan event live dan update info rider.
2. Ikuti data resmi yang sudah berjalan di sistem.

Checklist sebelum race:
1. Event ID yang dipakai MC benar.
2. Tampilan live sudah sinkron dengan status event.

Checklist saat race:
1. Hindari mengumumkan hasil yang belum final approval.

Checklist setelah race:
1. Pastikan hasil final yang dibacakan sesuai sistem.

## 3. Alur Operasional End-to-End

1. `Admin` siapkan event, kategori, rider, draw, moto, schedule.
2. `Race Control` buka operasional race day dan koordinasi flow.
3. `Checker` jalankan validasi gate dan proses start.
4. `Finisher` input urutan finish moto.
5. `Race Director` review dan finalisasi keputusan.
6. `MC` umumkan update live sesuai status resmi.
7. `Super Admin` standby untuk kontrol akses sepanjang event.

## 4. Aturan Eskalasi Singkat

- Isu login/akses -> `super_admin`.
- Isu data registrasi/rider/kategori -> `admin`.
- Isu flow race lapangan -> `race_control`.
- Isu hasil, protest, penalty, override -> `RACE_DIRECTOR`.

## 5. Catatan Implementasi

- Jangan ubah data fundamental saat race live kecuali darurat.
- Setiap perubahan krusial harus bisa dilacak (siapa, kapan, kenapa).
- Gunakan role sesuai kebutuhan, jangan pakai akun lintas role saat operasi.

