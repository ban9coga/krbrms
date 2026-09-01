-- RacePushbike Content Studio.
-- This extends Phase 1 Insight without removing or rewriting existing articles.
create table if not exists public.content_items (
  id uuid primary key default uuid_generate_v4(),
  topic text not null,
  status text not null default 'DRAFT',
  source_insight_post_id uuid unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ck_content_items_status check (status in ('DRAFT', 'PUBLISHED'))
);

alter table public.content_items
  drop constraint if exists fk_content_items_source_insight_post;

alter table public.content_items
  add constraint fk_content_items_source_insight_post
  foreign key (source_insight_post_id)
  references public.insight_posts(id)
  on delete set null;

alter table public.insight_posts
  add column if not exists content_item_id uuid,
  add column if not exists content_blocks jsonb not null default '[]'::jsonb,
  add column if not exists canonical_url text;

alter table public.insight_posts
  drop constraint if exists fk_insight_posts_content_item;

alter table public.insight_posts
  add constraint fk_insight_posts_content_item
  foreign key (content_item_id)
  references public.content_items(id)
  on delete set null;

alter table public.insight_posts
  drop constraint if exists ck_insight_posts_content_blocks;

alter table public.insight_posts
  add constraint ck_insight_posts_content_blocks
  check (jsonb_typeof(content_blocks) = 'array');

-- Existing Phase 1 articles become Content Studio items while retaining their
-- Markdown body. They remain publicly available exactly as before.
insert into public.content_items (topic, status, source_insight_post_id, created_at, updated_at)
select title, status, id, created_at, updated_at
from public.insight_posts
where content_item_id is null
on conflict (source_insight_post_id) do nothing;

update public.insight_posts post
set content_item_id = item.id
from public.content_items item
where post.content_item_id is null
  and item.source_insight_post_id = post.id;

create index if not exists idx_insight_posts_content_item
  on public.insight_posts(content_item_id);

create table if not exists public.content_instagram_packages (
  id uuid primary key default uuid_generate_v4(),
  content_item_id uuid not null unique references public.content_items(id) on delete cascade,
  post_type text not null default 'CAROUSEL',
  social_status text not null default 'NOT_READY',
  slides jsonb not null default '[]'::jsonb,
  caption text not null default '',
  cta text not null default '',
  hashtags text not null default '',
  notes text not null default '',
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ck_content_instagram_packages_type check (post_type in ('CAROUSEL', 'REEL', 'SINGLE_IMAGE')),
  constraint ck_content_instagram_packages_status check (social_status in ('NOT_READY', 'READY', 'POSTED')),
  constraint ck_content_instagram_packages_slides check (jsonb_typeof(slides) = 'array')
);

insert into public.content_instagram_packages (content_item_id)
select id from public.content_items
on conflict (content_item_id) do nothing;

drop trigger if exists trg_content_items_updated_at on public.content_items;
create trigger trg_content_items_updated_at
before update on public.content_items
for each row execute function public.set_updated_at();

drop trigger if exists trg_content_instagram_packages_updated_at on public.content_instagram_packages;
create trigger trg_content_instagram_packages_updated_at
before update on public.content_instagram_packages
for each row execute function public.set_updated_at();

alter table public.content_items enable row level security;
alter table public.content_instagram_packages enable row level security;

revoke all on public.content_items from anon, authenticated;
revoke all on public.content_instagram_packages from anon, authenticated;

comment on table public.content_items is
  'Private Content Studio parent entity. One topic can hold one Insight article and one Instagram package.';

comment on table public.content_instagram_packages is
  'Private Instagram content package for a Content Studio item. It is never exposed on public Insight routes.';
