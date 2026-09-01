-- Public editorial content for RacePushbike Insight.
-- Drafts stay private. Public visitors can only read rows marked PUBLISHED.
create table if not exists public.insight_posts (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  slug text not null,
  excerpt text not null,
  content_markdown text not null,
  cover_image_url text,
  cover_image_alt text not null default '',
  category text not null,
  status text not null default 'DRAFT',
  seo_title text,
  seo_description text,
  author_name text not null default 'RacePushbike Team',
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_insight_posts_slug unique (slug),
  constraint ck_insight_posts_status check (status in ('DRAFT', 'PUBLISHED')),
  constraint ck_insight_posts_category check (
    category in ('RULES_SCORING', 'RACE_KNOWLEDGE', 'RACE_ANALYSIS', 'EVENT_GUIDE')
  ),
  constraint ck_insight_posts_published_at check (
    (status = 'DRAFT') or published_at is not null
  )
);

create index if not exists idx_insight_posts_publication
  on public.insight_posts(status, published_at desc);

create index if not exists idx_insight_posts_category_publication
  on public.insight_posts(category, published_at desc);

drop trigger if exists trg_insight_posts_updated_at on public.insight_posts;
create trigger trg_insight_posts_updated_at
before update on public.insight_posts
for each row execute function public.set_updated_at();

alter table public.insight_posts enable row level security;

revoke all on public.insight_posts from anon, authenticated;
grant select on public.insight_posts to anon, authenticated;

drop policy if exists "public can read published insight posts" on public.insight_posts;
create policy "public can read published insight posts"
on public.insight_posts
for select
to anon, authenticated
using (status = 'PUBLISHED');

comment on table public.insight_posts is
  'RacePushbike Insight editorial posts. Public access is restricted to PUBLISHED rows.';

-- Initial public articles. These can be edited directly in Supabase Table Editor
-- until a dedicated CMS is introduced in a later phase.
insert into public.insight_posts (
  title,
  slug,
  excerpt,
  content_markdown,
  category,
  status,
  seo_title,
  seo_description,
  author_name,
  published_at
) values
  (
    'DNS vs DNF di Race Pushbike: Apa Bedanya?',
    'dns-vs-dnf-race-pushbike',
    'Memahami perbedaan DNS dan DNF, dampaknya terhadap hasil moto, serta alasan kedua status ini perlu dicatat dengan tepat.',
    $article$
Dalam race pushbike, **DNS** dan **DNF** sama-sama berarti rider tidak menyelesaikan hasil seperti rider yang finish. Namun keduanya terjadi pada momen yang berbeda dan dicatat untuk alasan yang berbeda.

## DNS: tidak start

DNS adalah singkatan dari *Did Not Start*. Status ini dipakai ketika rider tidak hadir di gate, tidak siap saat dipanggil, atau tidak benar-benar memulai moto.

Contoh yang umum terjadi:

- rider belum tiba di gate saat waktu panggilan selesai;
- rider mengundurkan diri sebelum gate turun;
- rider sudah terdaftar tetapi tidak hadir pada moto tersebut.

## DNF: start tetapi tidak finish

DNF adalah singkatan dari *Did Not Finish*. Rider sudah memulai moto, tetapi tidak dapat menyelesaikan race, misalnya karena berhenti, mengalami kendala, atau keluar dari lintasan.

| Status | Kapan dipakai | Catatan hasil |
| --- | --- | --- |
| DNS | Rider tidak mulai race | Dicatat sebagai tidak start |
| DNF | Rider sudah mulai tetapi tidak finish | Bisa disertai progres lintasan bila fitur event menggunakannya |

## Kenapa pencatatan ini penting?

Catatan DNS dan DNF membantu panitia menjaga hasil tiap moto tetap transparan. Saat ada rider dengan total poin yang sama, riwayat hasil dapat menjadi salah satu bahan tie-break sesuai aturan event.

> Aturan poin, penalty, dan tie-break dapat berbeda di setiap event. Selalu ikuti peraturan teknis dan keputusan Race Director pada event yang sedang berlangsung.
$article$,
    'RULES_SCORING',
    'PUBLISHED',
    'DNS vs DNF di Race Pushbike: Apa Bedanya?',
    'Panduan sederhana memahami DNS dan DNF dalam hasil race pushbike.',
    'RacePushbike Team',
    now() - interval '2 days'
  ),
  (
    'Kenapa Rider Dibagi ke Dalam Batch?',
    'kenapa-rider-dibagi-batch',
    'Pembagian batch membuat race lebih aman, lebih mudah dipantau, dan memberi urutan gate yang jelas untuk setiap rider.',
    $article$
Ketika jumlah rider dalam satu kategori lebih banyak daripada jumlah gate yang tersedia, panitia membaginya ke beberapa **batch**. Batch adalah kelompok rider yang menjalankan moto secara bergantian dalam kategori yang sama.

## Tujuan pembagian batch

Pembagian batch bukan sekadar membagi daftar nama. Sistem ini membantu race berjalan lebih rapi.

- jumlah rider di gate tetap sesuai kapasitas lintasan;
- checker dan finisher dapat fokus pada satu kelompok rider;
- hasil setiap moto lebih mudah diperiksa;
- urutan berikutnya dapat dihitung dengan konsisten.

## Contoh sederhana

Jika kategori memiliki 16 rider dan gate tersedia untuk 8 rider, kategori tersebut dapat dibagi menjadi dua batch. Setiap batch menjalankan moto sesuai format race yang dipilih oleh event.

## Apa yang perlu diperhatikan orang tua?

Nama batch bukan prestasi dan bukan penilaian akhir. Batch hanya bagian dari pengaturan race sebelum hasil tiap moto dihitung.

> Jumlah batch, jumlah moto, dan cara pembagian rider mengikuti konfigurasi serta peraturan teknis masing-masing event.
$article$,
    'RACE_KNOWLEDGE',
    'PUBLISHED',
    'Kenapa Rider Dibagi ke Dalam Batch?',
    'Penjelasan pembagian batch pada race pushbike untuk rider dan orang tua.',
    'RacePushbike Team',
    now() - interval '1 day'
  ),
  (
    'Apa Itu Snake Seeding di Race Pushbike?',
    'apa-itu-snake-seeding-pushbike',
    'Mengenal cara pembagian rider ke batch lanjutan dengan pola zig-zag agar komposisi batch tetap seimbang.',
    $article$
Saat race masuk ke babak lanjutan seperti quarter final atau semifinal, rider dapat dibagi ulang dengan metode **snake seeding**. Metode ini menyebarkan rider berdasarkan seed atau peringkat agar satu batch tidak menumpuk semua rider dengan posisi teratas.

## Cara membacanya

Misalnya ada empat batch lanjutan. Rider dengan seed tertinggi ditempatkan berurutan dari Batch 1 sampai Batch 4. Setelah itu arah pembagian berbalik dari Batch 4 kembali ke Batch 1.

1. Seed 1 sampai 4: Batch 1, 2, 3, 4.
2. Seed 5 sampai 8: Batch 4, 3, 2, 1.
3. Pola ini diulang sampai slot batch terisi.

## Mengapa memakai pola zig-zag?

Pola ini membantu menjaga distribusi rider antar batch tetap seimbang. Setelah pembagian batch terbentuk, urutan gate di dalam batch ditentukan oleh aturan race yang berlaku.

## Bukan satu-satunya aturan

Snake seeding dapat dipadukan dengan rank, poin, status hasil, atau aturan tie-break yang sudah ditentukan event. Karena itu hasil akhir pembagian harus selalu mengacu pada konfigurasi dan keputusan resmi panitia.

> Sistem race dapat memiliki format berbeda untuk setiap event. Artikel ini adalah penjelasan umum, bukan pengganti peraturan teknis event.
$article$,
    'RACE_ANALYSIS',
    'PUBLISHED',
    'Apa Itu Snake Seeding di Race Pushbike?',
    'Penjelasan pola snake seeding untuk pembagian batch babak lanjutan race pushbike.',
    'RacePushbike Team',
    now()
  )
on conflict (slug) do update set
  title = excluded.title,
  excerpt = excluded.excerpt,
  content_markdown = excluded.content_markdown,
  category = excluded.category,
  status = excluded.status,
  seo_title = excluded.seo_title,
  seo_description = excluded.seo_description,
  author_name = excluded.author_name,
  published_at = excluded.published_at;
