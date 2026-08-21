-- embeddd · схема
create table if not exists projects (
  id text primary key,
  slug text unique,
  name text not null,
  color text not null default '#C6F04A',
  position double precision not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists collections (
  id          text primary key,
  slug        text unique,
  name        text not null,
  color       text not null default '#C6F04A',
  position    double precision not null default 0,
  access_mode text not null default 'private',
  share_token text,
  project_id  text references projects(id) on delete set null,
  created_at  timestamptz not null default now()
);

-- slugs всегда NOT NULL, fallback на id из backfill.
create table if not exists items (
  id            text primary key,
  slug          text unique not null,
  collection_id text references collections(id) on delete set null,
  kind          text not null,
  provider      text,
  position      double precision not null default 0,
  fav           boolean not null default false,
  url           text,
  host          text,
  embed_url     text,
  embed_h       integer,
  ratio         double precision,
  src           text,
  thumb         text,
  width         integer,
  height        integer,
  r2_key        text,
  r2_thumb_key  text,
  title         text default '',
  note          text default '',
  display_size  text not null default 'M',
  text_style    text not null default 'p',
  tags          text[] not null default '{}',
  archived_at   timestamptz,
  content_hash  text,
  created_at    timestamptz not null default now()
);

create table if not exists achievements (
  key         text primary key,
  unlocked_at timestamptz not null default now()
);

create table if not exists user_stats (
  id         text primary key,
  visits     integer not null default 0,
  last_visit date,
  ai_credits integer not null default 100
);

create table if not exists account_profile (
  id          text primary key,
  nickname    text not null default 'embeddd',
  email       text not null default '',
  avatar_url  text,
  role        text not null default 'owner',
  permissions text[] not null default array['manage_content','manage_projects','manage_ai','manage_account']::text[],
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Колонки выше (project_id, slug, ai_credits, archived_at, content_hash) уже
-- покрыты migrations/004, 005, 006, 008, которые применяются следом за этим
-- файлом — здесь их незачем повторять. items.slug уже NOT NULL в CREATE TABLE
-- выше; projects/collections исторически создавались без NOT NULL, отдельные
-- ALTER ниже это закрывают (миграция 005 уже забэкфиллила старые NULL, а на
-- свежей БД таблица создаётся пустой, так что ALTER безопасен в обоих случаях).
alter table projects alter column slug set not null;
alter table collections alter column slug set not null;

create unique index if not exists projects_slug_idx on projects (slug);
create unique index if not exists collections_slug_idx on collections (slug);
create unique index if not exists items_slug_idx on items (slug);

create index if not exists items_position_idx on items (position);
create index if not exists items_collection_idx on items (collection_id);
create index if not exists collections_project_idx on collections (project_id);
create index if not exists items_archived_idx on items (archived_at);
create index if not exists items_content_hash_idx on items (content_hash);
create index if not exists items_tags_idx on items using gin (tags);
create index if not exists items_fav_idx on items (fav) where fav;
