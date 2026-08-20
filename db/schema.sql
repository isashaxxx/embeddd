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
  project_id text references projects(id) on delete set null,
  created_at  timestamptz not null default now()
);

create table if not exists items (
  id            text primary key,
  slug          text unique,
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
  created_at    timestamptz not null default now()
);

create table if not exists achievements (
  key         text primary key,
  unlocked_at timestamptz not null default now()
);

create table if not exists user_stats (
  id         text primary key,
  visits     integer not null default 0,
  last_visit date
);

-- `create table if not exists` не расширяет уже существующую таблицу.
alter table collections add column if not exists project_id text references projects(id) on delete set null;
alter table projects add column if not exists slug text;
alter table collections add column if not exists slug text;
alter table items add column if not exists slug text;
update projects set slug = id where slug is null;
update collections set slug = id where slug is null;
update items set slug = id where slug is null;
create unique index if not exists projects_slug_idx on projects (slug);
create unique index if not exists collections_slug_idx on collections (slug);
create unique index if not exists items_slug_idx on items (slug);

create index if not exists items_position_idx on items (position);
create index if not exists items_collection_idx on items (collection_id);
create index if not exists collections_project_idx on collections (project_id);
