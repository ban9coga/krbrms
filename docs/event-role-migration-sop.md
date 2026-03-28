# Event Role Migration SOP

Dokumen ini menjelaskan urutan migrasi dari role global ke role per-event (`user_event_roles`) supaya operasional tidak putus di hari lomba.

## Tujuan

- `SUPER_ADMIN` dipakai sebagai Central Admin
- `ADMIN` dipakai sebagai Operator Admin
- role lain dipakai sebagai field operator per event
- akses checker, finisher, race director, dan MC dibatasi oleh event assignment

## Fase 1: Fondasi Database

Jalankan migration berikut secara berurutan:

1. `docs/sql/migrations/2026-03-28_user_event_roles.sql`
2. `docs/sql/migrations/2026-03-28_user_event_roles_seed.sql`

Catatan:

- migration pertama membuat tabel assignment per event
- migration seed menyalin user dengan role global ke semua event yang ada sekarang
- seed ini dipakai untuk transisi aman, bukan kondisi final

## Fase 2: Verifikasi Awal

Setelah migration selesai:

1. Login sebagai Central Admin
2. Buka `Admin > Events > [event] > Settings`
3. Masuk ke section `Business & Roles`
4. Cek `Event Staff Assignments`

Yang harus dicek:

- semua user penting muncul di daftar user assignable
- event yang sedang aktif punya checker, finisher, race director, dan MC
- Central Admin dan Operator Admin event tersebut sudah terpasang

## Fase 3: Rapikan Assignment per Event

Seed awal akan membuat assignment terlalu lebar karena semua user lama disalin ke semua event. Setelah itu rapikan satu per satu:

1. Tentukan siapa Central Admin event
2. Tentukan siapa Operator Admin event
3. Tentukan field operator event:
   - Checker
   - Finisher
   - Race Director
   - Race Control
   - MC
4. Hapus assignment user yang tidak relevan di event itu

Aturan praktis:

- `SUPER_ADMIN` hanya untuk tim pusat
- `ADMIN` untuk operator event
- field operator hanya ditempel ke event yang benar-benar mereka jalankan

## Fase 4: Uji Jalur Operasional

Setelah assignment dirapikan, tes jalur ini:

1. Checker
   - buka `/jc`
   - pastikan hanya event yang ditugaskan yang muncul
   - buka 1 moto dan cek safety/status rider

2. Finisher
   - buka `/jury/finish`
   - pastikan hanya event yang ditugaskan yang muncul
   - input result di event yang assigned

3. Race Director
   - buka `/race-director/approval`
   - pastikan hanya bisa baca approval event yang assigned

4. MC
   - buka `/mc`
   - pastikan hanya event yang assigned yang muncul
   - buka `/mc/[eventId]`

## Fase 5: Masa Transisi

Saat ini sistem masih punya fallback ke role global bila assignment event belum ditemukan. Itu dipertahankan sementara supaya:

- user lama tidak langsung terkunci
- rollout bisa bertahap
- event yang sedang dekat hari H tetap aman

Artinya:

- assignment event sudah mulai dipakai
- tapi role global belum sepenuhnya dimatikan

## Fase 6: Cutover Penuh

Setelah semua event aktif sudah punya assignment yang bersih, lakukan cutover:

1. audit user mana yang masih bergantung ke role global
2. pastikan semua event aktif punya assignment lengkap
3. nonaktifkan fallback global di helper auth/jury auth
4. jadikan `user_event_roles` sebagai sumber akses utama

Fase ini jangan dilakukan sebelum semua event penting lulus uji operasional.

## Rekomendasi Operasional

Untuk event yang akan dipakai dekat-dekat ini:

1. seed dulu
2. rapikan assignment hanya untuk event yang akan dipakai
3. uji checker, finisher, RD, dan MC
4. jangan langsung cabut fallback global

## Template Minimum Assignment per Event

Paling aman, minimal ada:

- 1 Central Admin
- 1 Operator Admin
- 1 Checker
- 1 Finisher
- 1 Race Director
- 1 MC

Opsional:

- 1 Race Control

## Catatan

Kalau satu akun dipakai lintas event, itu tetap boleh. Bedanya nanti assignment-nya ditempel eksplisit ke event yang memang dia pegang.
