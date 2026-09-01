# Panduan Aturan Race Pushbike

Panduan ini menjelaskan cara sistem menentukan alur moto, hasil race, perpindahan babak, dan urutan akhir rider. Gunakan dokumen ini sebagai acuan singkat untuk admin, Race Director, checker, finisher, MC, serta wali rider yang membutuhkan penjelasan hasil.

## 1. Istilah Penting

| Istilah | Arti sederhana |
| --- | --- |
| Moto | Satu race untuk satu kelompok rider. Contoh: Moto 1 - Batch 2. |
| Batch | Kelompok rider dalam satu kategori. |
| Stage | Babak race: Qualification, Repechage, Quarter Final, Semi Final, atau Final. |
| Gate | Posisi start rider. Gate 1 berarti posisi start pertama. |
| Seed | Urutan dasar rider dari hasil babak sebelumnya. Dipakai untuk membagi rider dan menentukan gate babak berikutnya. |
| Final Class | Kelas final, misalnya Explorer, Beginner, Rookie, Novice, Academy, Pro, atau Elite. Kelas yang aktif mengikuti pengaturan event. |

## 2. Status Moto

| Status | Makna | Siapa yang bekerja |
| --- | --- | --- |
| `UPCOMING` | Moto belum diperiksa dan belum dapat dimulai. | Checker menyiapkan rider. |
| `READY` | Checker sudah menyelesaikan pemeriksaan rider dan safety. Moto belum race. | Menunggu giliran live. |
| `LIVE` | Moto sedang berjalan. | Finisher mencatat urutan finish; checker dapat menangani DNS di gate. |
| `PROVISIONAL` | Hasil sudah dikirim finisher, tetapi masih dalam masa pemeriksaan/komplain. | Race Director dapat review bila diperlukan. |
| `PROTEST_REVIEW` | Ada review/komplain resmi pada hasil moto. | Race Director menyelesaikan review. |
| `LOCKED` | Hasil moto sudah final dan menjadi dasar babak berikutnya. | Data tidak boleh diubah tanpa membuka kunci. |

### Alur normal satu moto

1. Checker memeriksa rider pada panel **Next Moto Prep**.
2. Checker menandai rider `READY` atau `ABSENT`, serta mencatat safety gear bila ada pelanggaran.
3. Setelah seluruh rider sudah diperiksa, checker menekan **Moto Ready**. Status moto menjadi `READY`.
4. Ketika gilirannya tiba, moto menjadi `LIVE`.
5. Finisher memasukkan urutan rider dan menekan **Submit Result**. Status moto menjadi `PROVISIONAL`.
6. Jika moto berikutnya sudah `READY`, sistem memindahkannya ke `LIVE` dan moto sebelumnya otomatis menjadi `LOCKED`.
7. Jika tidak ada moto berikutnya dalam stage tersebut, moto terakhir dikunci agar sistem dapat menghitung stage berikutnya.

Tujuan status `READY` adalah mencegah dua moto menjadi `LIVE` bersamaan dan memberi checker waktu menyiapkan rider berikutnya.

## 3. Tugas Setiap Role Saat Race

### Checker

- Bekerja di area persiapan dan gate start.
- Menandai kesiapan rider satu per satu: `READY` atau `ABSENT`.
- Dapat memakai **All Riders Ready** bila seluruh rider memang sudah siap; tombol ini dapat di-undo sebelum Moto Ready.
- Mencatat safety gear/pelanggaran sesuai mapping penalty yang aktif.
- Menekan **Moto Ready** hanya setelah data rider benar.
- Saat moto `LIVE`, checker dapat menetapkan atau membatalkan `DNS` untuk rider yang tidak start/keluar dari gate.

### Finisher

- Memilih rider sesuai urutan mereka melewati finish.
- Menetapkan `DNF` bila rider sudah start tetapi tidak menyelesaikan race.
- Menetapkan `DNS` bila rider tidak start dan checker belum sempat mencatatnya.
- Memastikan semua rider memiliki hasil sebelum menekan **Submit Result**.

### Race Director

- Membuka review pada moto `PROVISIONAL` bila ada komplain.
- Mengunci moto setelah hasil dipastikan benar atau menangani koreksi saat review.
- Menjalankan perhitungan stage berikutnya bila tombol **Compute Stage Berikutnya** tersedia.

### Admin

- Menyiapkan kategori, Final Class Rules, draw, urutan moto, penalty mapping, dan konfigurasi event.
- Tidak mengubah struktur besar atau hasil yang sudah locked ketika race sedang berlangsung kecuali atas keputusan Race Director.

## 4. READY, ABSENT, DNS, DNF, dan DQ

### READY

Rider hadir, lolos pemeriksaan, dan siap masuk gate. READY bukan hasil race dan tidak memberi poin.

### ABSENT

Rider tidak hadir saat pemeriksaan persiapan. Sistem menampilkan status **ABSENT** pada panel operasional. Saat hasil moto disimpan, absent diperlakukan seperti DNS untuk perhitungan poin/pinalti bila fitur DNS aktif.

### DNS (Did Not Start)

DNS dipakai jika rider tidak start, misalnya tidak datang setelah pemanggilan atau sudah di gate tetapi tidak jalan ketika gate turun.

- Rider DNS berada di bawah rider Finish dan DNF pada hasil moto.
- Poin dasar DNS adalah posisi terakhir pada moto.
- Pinalti otomatis DNS ditambahkan pada kolom **Penalty**. Nilainya diatur per event pada menu **Penalties**; nilai default sistem adalah 9.

### DNF (Did Not Finish)

DNF dipakai jika rider sudah start tetapi tidak menyelesaikan race.

- Rider DNF berada di bawah rider Finish, tetapi di atas DNS.
- Poin dasar DNF adalah posisi terakhir, lalu pinalti otomatis DNF ditambahkan pada kolom **Penalty**. Nilainya diatur per event pada menu **Penalties**; nilai default sistem adalah 9.
- Jika fitur **DNF berdasarkan progres trek** aktif, finisher mengisi progress 0–100%. Untuk sesama DNF, rider yang mencapai progress lebih jauh ditempatkan lebih baik.

### DQ (Disqualified)

DQ dipakai untuk diskualifikasi. Rider DQ tidak mendapatkan ranking normal pada moto tersebut dan berada di bawah hasil lain.

## 5. Penalty Safety Gear

1. Admin membuat daftar safety requirement, misalnya helm, sepatu, atau sarung tangan.
2. Admin menyimpan mapping setiap requirement ke kode dan nilai penalty.
3. Checker menandai gear yang tidak sesuai saat prep.
4. Nilai penalty tersimpan pada rider dan muncul di hasil moto setelah hasil disubmit.

Penalty safety gear berbeda dari pinalti otomatis DNS/DNF. Keduanya dapat muncul bersamaan pada kolom **Penalty**.

## 6. Qualification dan Perpindahan Babak

Pengaturan **Final Class Rules** menentukan rider dari rank berapa masuk ke babak mana. Contoh sederhana:

| Hasil Qualification | Tujuan |
| --- | --- |
| Rank 1–4 tiap batch | Semi Final |
| Rank 5–6 tiap batch | Repechage |
| Rank 7–8 tiap batch | Final Rookie |

Aturan setiap event dapat berbeda. Sistem selalu memakai aturan yang tersimpan pada kategori tersebut, bukan contoh di atas.

### Cara stage dibuat

1. Semua moto pada stage sebelumnya harus selesai dan `LOCKED`.
2. Admin/Race Director menjalankan **Run Qualification** atau **Compute Stage Berikutnya**.
3. Sistem membaca ranking stage sebelumnya dan Final Class Rules.
4. Sistem membuat moto Repechage, Quarter Final, Semi Final, atau Final yang diperlukan.
5. Checker akan melihat moto baru itu pada **Next Moto Prep** selama kategori yang berjalan belum menyelesaikan seluruh finalnya.

Hasil Qualification tidak dihitung ulang setelah stage lanjutan sudah dibuat. Ini menjaga jalur bracket yang sudah berjalan tetap stabil.

## 7. Pembagian Batch dan Gate Stage Berikutnya

Sistem memakai **seed** untuk membagi rider ke batch stage berikutnya. Sederhananya:

1. Rider diurutkan berdasarkan rank dari babak sebelumnya.
2. Bila rank sama, poin menjadi pembanding.
3. Bila masih sama karena DNS/DNF, sistem memakai urutan seed/rank sebelumnya sebagai pembanding terakhir.
4. Rider kemudian dibagi ke batch dengan pola seimbang (snake/zigzag) agar kekuatan tiap batch tidak menumpuk pada satu batch.
5. Gate di dalam batch mengikuti urutan seed hasil pembagian itu.

Seed dipakai untuk **gate dan pembagian batch**, bukan untuk mengalahkan hasil race yang sudah terjadi.

## 8. Aturan Ranking Hasil Moto dan Final

### Hasil satu moto

Urutan dasar hasil adalah:

1. Rider `FINISH`, berdasarkan urutan melewati garis finish.
2. Rider `DNF`.
3. Rider `DNS` atau `ABSENT`.
4. Rider `DQ`.

Untuk sesama DNF ketika progress trek aktif, progress yang lebih tinggi ditempatkan lebih atas.

### Hasil Final

Hasil Final menentukan podium kelas tersebut. Riwayat lama tidak boleh mengalahkan rider yang finish lebih baik di Final.

Jika ada rider dengan status Final yang sama dan poin sama, sistem memakai urutan berikut:

1. Untuk sesama DNF: progress trek Final yang lebih tinggi menang.
2. Riwayat DNS lebih sedikit menang.
3. Jika masih sama, riwayat DNF lebih sedikit menang.
4. Jika masih sama, jumlah hasil Finish sebelumnya lebih banyak menang.
5. Jika semuanya masih sama, baru memakai seed/rank dari stage sebelumnya.

Contoh: Rider A DNS sejak Qualification hingga Final, sedangkan Rider B finish pada stage sebelumnya tetapi DNS di Final. Keduanya tetap DNS di Final, namun Rider B berada di atas Rider A karena riwayat partisipasinya lebih baik.

## 9. Koreksi Hasil dan Unlock Moto

- Moto `LOCKED` dianggap hasil final dan menjadi dasar stage berikutnya.
- Jika ada kesalahan, Race Director dapat membuka kunci moto lalu menghapus/reset hasil sesuai wewenang.
- Setelah hasil dikoreksi, moto harus disubmit dan dikunci kembali.
- Bila stage berikutnya sudah terbuat, jangan menjalankan compute ulang sembarangan. Pastikan dampaknya pada bracket berikutnya sudah dipahami.

## 10. Checklist Singkat Race Day

### Sebelum race

- Final Class Rules sudah benar.
- Draw, gate, dan urutan moto sudah diperiksa.
- Penalty mapping serta modul DNS/DNF sudah aktif sesuai aturan event.
- Semua checker dan finisher sudah login ke event yang benar.

### Saat race

- Checker: periksa rider, safety, lalu tekan Moto Ready.
- Finisher: isi semua hasil sebelum Submit Result.
- Race Director: pastikan hasil Provisional benar sebelum membiarkan atau mengunci moto.
- Jangan memindahkan urutan moto atau mengubah Final Class Rules saat bracket sudah berjalan kecuali diperlukan untuk koreksi resmi.

### Setelah race

- Pastikan semua Final sudah `LOCKED`.
- Periksa halaman hasil akhir dan status DNS/DNF/DQ.
- Cetak atau ekspor rekap hasil jika sudah final.

## 11. Catatan Penting

- Konfigurasi Final Class Rules berbeda antar kategori dan event; selalu lihat aturan pada event yang sedang dipakai.
- Nilai pinalti DNS/DNF berlaku untuk seluruh kategori dalam event, kecuali event memiliki pengaturan khusus yang valid.
- Jika ada komplain, jangan langsung mengubah hasil locked. Gunakan alur review oleh Race Director agar jejak koreksi tetap jelas.
