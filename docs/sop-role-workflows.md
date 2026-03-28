# SOP & Workflow Sistem Per Role

Dokumen ini disusun untuk operasional harian sistem race management dengan model role berikut:
- `SUPER_ADMIN` = Central Admin
- `ADMIN` = Operator Admin
- role lain = field operator per event

Dokumen ini diasumsikan dipakai untuk event pushbike dengan alur draw, checker, finish, approval, live display, dan publikasi hasil.

## 1. Prinsip Operasional
1. Semua role operasional bekerja per event.
2. Penugasan user sebaiknya selalu diatur dari `Event Staff Assignments` pada settings event.
3. Hasil lomba harus bergerak cepat, tetapi keputusan yang sensitif tetap harus bisa diaudit.
4. Operasional lapangan dibagi agar satu orang tidak menanggung semua titik kritis sekaligus.

## 2. Ringkasan Peran

### Central Admin
Tugas utama:
- setup event
- kontrol user dan role
- monitor semua event
- rescue bila operator mengalami masalah
- final support untuk branding, settings, dan hasil

Halaman utama:
- `/admin`
- `/admin/events`
- `/admin/events/[eventId]/settings`
- `/admin/users`

### Operator Admin
Tugas utama:
- kelola event yang ditugaskan
- data rider, category, draw, moto, schedule, penalties, settings event
- assign field operator untuk event tersebut

Halaman utama:
- `/admin/events`
- `/admin/events/[eventId]`
- `/admin/events/[eventId]/settings`
- `/admin/events/[eventId]/motos`
- `/admin/events/[eventId]/results`

### Checker
Tugas utama:
- safety check rider di gate
- tandai READY atau ABSENT
- memastikan rider yang masuk gate sudah sesuai moto yang LIVE

Halaman utama:
- `/jc`
- `/jc/[eventId]/[motoId]`

### Finisher
Tugas utama:
- input finish order
- submit hasil moto
- review ulang hasil kalau ada koreksi dari RD

Halaman utama:
- `/jury/finish`

### Race Director
Tugas utama:
- pantau approval / penalty / gate status
- lock moto jika hasil sudah final
- audit keputusan penting

Halaman utama:
- `/race-director/approval`

### Race Control
Tugas utama:
- memonitor urutan waiting zone
- memanggil rider berikutnya
- memastikan batch / moto berikutnya benar

Halaman utama:
- `/race-control`

### MC
Tugas utama:
- lihat ranking / live board untuk pengumuman
- menyampaikan hasil yang sedang berjalan atau final ke publik

Halaman utama:
- `/mc`
- `/mc/[eventId]`

## 3. Alur Sistem End-to-End

### A. Sebelum Hari H
1. Central Admin membuat event.
2. Operator Admin melengkapi:
   - categories
   - riders / registrations
   - motos / draw
   - schedule
   - penalties / safety mapping
   - business settings
3. Operator Admin mengisi `Event Staff Assignments` untuk event tersebut.
4. Central Admin mengecek:
   - role per event sudah benar
   - event branding benar
   - flow publik sudah terbuka sesuai kebutuhan
5. Lakukan uji singkat:
   - checker bisa masuk
   - finisher bisa masuk
   - RD bisa masuk
   - MC bisa masuk
   - live result page bisa dibuka publik

### B. Saat Race Berjalan
1. Operator Admin mengubah event menjadi `LIVE`.
2. Checker bekerja per moto yang sedang LIVE.
3. Race Control memantau waiting zone dan batch berikutnya.
4. Finisher memasukkan hasil finish moto.
5. Race Director memantau penalty / approval / lock status.
6. MC melihat live board untuk pengumuman.
7. Publik melihat hasil dari halaman event / live score.

### C. Setelah Moto Selesai
1. Finisher submit hasil.
2. Jika ada issue, RD review.
3. Jika sudah final, RD lock moto.
4. Hasil publik tetap tampil.
5. Operator Admin bisa lanjut ke moto berikutnya.

### D. Setelah Event Selesai
1. Operator Admin review results summary.
2. Event diubah menjadi `FINISHED`.
3. Halaman publik event tetap menampilkan race categories dan hasil.
4. Hasil dapat dipakai untuk export, story card, dan dokumentasi event.

## 4. SOP Per Role

## 4.1 Central Admin SOP

### Sebelum Event
1. Login ke `/admin`.
2. Pastikan event sudah dibuat atau bantu operator membuat event.
3. Cek `Event Settings`:
   - business settings
   - event logo
   - draw mode
   - multi-stage settings jika dipakai
4. Cek `Event Staff Assignments`:
   - ada Central Admin
   - ada Operator Admin
   - ada Checker
   - ada Finisher
   - ada Race Director
   - ada MC bila dipakai
5. Cek role global hanya sebagai fallback, bukan sebagai kebiasaan utama.

### Saat Event Berjalan
1. Pantau dashboard admin dan halaman event publik.
2. Jika operator lapangan terkendala login/role, bantu assign ulang dari settings event.
3. Jika ada masalah data besar, bantu audit dari admin panels.
4. Jangan terlalu sering intervensi hasil jika operator lapangan masih bisa menangani.

### Setelah Event
1. Pastikan moto penting sudah locked.
2. Pastikan hasil final terlihat publik.
3. Simpan dokumentasi dan export jika diperlukan.
4. Ubah event ke `FINISHED` saat memang selesai.

## 4.2 Operator Admin SOP

### Sebelum Event
1. Login ke `/admin/events`.
2. Buka event yang ditangani.
3. Pastikan data berikut lengkap:
   - riders
   - categories
   - motos
   - schedule
   - penalties dan safety requirements
   - business settings
4. Isi `Event Staff Assignments`.
5. Jika draw dilakukan di luar sistem, pilih `External Draw` lalu paste urutan sesuai hasil resmi.

### Saat Event Berjalan
1. Pastikan event status `LIVE`.
2. Dampingi checker dan finisher bila ada perubahan rider / gate.
3. Pantau results summary dan live score.
4. Koordinasikan dengan RD bila ada penalty atau hasil yang perlu review.

### Setelah Event
1. Review hasil per kategori.
2. Cek story card jika ingin dipakai untuk dokumentasi/unggahan.
3. Ubah event ke `FINISHED` jika seluruh race selesai.

## 4.3 Checker SOP

### Halaman
- `/jc`
- `/jc/[eventId]/[motoId]`

### Tugas
1. Pilih moto yang LIVE.
2. Cari rider bila perlu menggunakan search.
3. Lakukan safety checklist.
4. Tandai:
   - `READY` jika rider aktif dan siap start
   - `ABSENT` jika rider tidak hadir di gate
5. Gunakan `All Ready` hanya bila semua rider yang hadir memang siap.

### Catatan Operasional
- Jika ada warning safety, rider bisa tetap lanjut sesuai rule event, tetapi penalty/warning harus tetap tercatat.
- Checker tidak menentukan hasil finish.
- Checker fokus pada kesiapan gate.

## 4.4 Finisher SOP

### Halaman
- `/jury/finish`

### Tugas
1. Pilih event dan moto yang sedang diproses.
2. Input urutan finish sesuai hasil lapangan.
3. Pastikan rider yang DNS/DNF/ABSENT tercatat dengan benar.
4. Submit hasil moto.
5. Jika ada koreksi dari RD, buka ulang sesuai arahan yang berlaku.

### Catatan Operasional
- Finisher adalah titik kritis paling sensitif; idealnya gunakan tablet atau device yang stabil.
- Jangan submit ganda tanpa memastikan state hasil sudah ter-update.

## 4.5 Race Director SOP

### Halaman
- `/race-director/approval`

### Tugas
1. Pilih event yang aktif.
2. Pantau:
   - pending status
   - pending penalties
   - gate status
   - audit logs
3. Jika approval mode `DIRECTOR`, buat keputusan approve/reject bila diperlukan.
4. Kunci moto hanya setelah hasil benar-benar final.
5. Gunakan audit log untuk review kejadian penting.

### Catatan Operasional
- RD tidak perlu menginput finish order langsung kecuali ada kebutuhan rescue.
- Lock moto adalah tindakan final; lakukan hanya setelah semua oke.

## 4.6 Race Control SOP

### Halaman
- `/race-control`

### Tugas
1. Pilih event aktif.
2. Pantau queue moto LIVE / UPCOMING.
3. Gunakan data gate, nama, no plate, dan komunitas untuk calling rider.
4. Pastikan urutan yang dipanggil sesuai sequence moto per batch.

### Urutan Sequence
Urutan standar yang dipakai sistem:
1. Moto 1 - Batch 1
2. Moto 1 - Batch 2
3. Moto 2 - Batch 1
4. Moto 2 - Batch 2
5. dan seterusnya per kategori

### Catatan Operasional
- Race Control tidak mengubah hasil finish.
- Race Control fokus menjaga transisi antar batch tetap rapi.

## 4.7 MC SOP

### Halaman
- `/mc`
- `/mc/[eventId]`

### Tugas
1. Pilih event LIVE.
2. Buka live board event.
3. Gunakan ranking/top 8 yang tampil untuk pengumuman.
4. Jika ada protest review, tunggu status clear sebelum umumkan hasil final.

### Catatan Operasional
- MC memakai data sebagai referensi on-stage announcement.
- Jika hasil berubah karena review, MC harus mengikuti data board terbaru.

## 5. Workflow Khusus Berdasarkan Mode Draw

### Internal Live Draw
Dipakai bila draw dilakukan di sistem.
1. Operator Admin menyiapkan category dan riders.
2. Sistem/generator membuat motos.
3. Operator review hasil.
4. Race day mengikuti urutan moto yang sudah dibuat sistem.

### External Draw
Dipakai bila live draw dilakukan di luar sistem.
1. Hasil draw resmi didapat dari luar sistem.
2. Operator Admin memilih `External Draw`.
3. Operator memasukkan urutan/gate sesuai hasil draw eksternal.
4. Sistem dipakai untuk operasional checker, finish, result, dan publikasi.

## 6. Workflow Event dengan Banyak Pihak
Contoh model yang sudah dibahas:
- Event Owner: Kampar Runbike
- Operating Committee: RC Balabila
- Scoring Support: KRB
- Platform: Pushbike Race Management Platform

Flow:
1. Event dibuat dan di-branding sesuai event owner.
2. Operator lapangan diassign lewat `Event Staff Assignments`.
3. KRB atau tim pusat tetap bisa menjadi Central Admin / scoring support.
4. Publik melihat brand event, sedangkan operasional tetap dijalankan oleh role yang ditugaskan.

## 7. Checklist Singkat Hari H

### Central Admin
- [ ] Event LIVE
- [ ] Role per event benar
- [ ] Public page jalan
- [ ] Results summary bisa dibuka

### Operator Admin
- [ ] Riders final
- [ ] Motos final
- [ ] Draw mode benar
- [ ] Staff assignment benar

### Checker
- [ ] Moto LIVE dipilih
- [ ] Safety checklist jalan
- [ ] Ready/Absent sesuai kondisi gate

### Finisher
- [ ] Moto benar
- [ ] Finish order benar
- [ ] Submit berhasil

### Race Director
- [ ] Gate status dipantau
- [ ] Pending approvals dicek
- [ ] Moto dikunci hanya setelah final

### Race Control
- [ ] Event benar
- [ ] Queue berikutnya jelas
- [ ] Calling sesuai batch / moto

### MC
- [ ] Event LIVE benar
- [ ] Ranking board update
- [ ] Pengumuman mengikuti status board terbaru

## 8. Rekomendasi Device
- Central Admin: laptop atau tablet besar
- Operator Admin: laptop atau tablet landscape
- Checker: tablet portrait
- Finisher: tablet landscape atau phone besar
- Race Director: tablet landscape
- Race Control: tablet landscape
- MC: phone atau tablet

## 9. Catatan Transisi Role
Saat ini sistem sedang transisi dari role global ke role per-event.
Praktik yang direkomendasikan:
1. tetap buat user dengan role global dasar
2. assign user ke event dari `Event Staff Assignments`
3. gunakan role per-event sebagai sumber operasional utama
4. hindari bergantung terus pada fallback role global
