-- embeddd · схема
create table if not exists collections (
  id          text primary key,
  name        text not null,
  color       text not null default '#C6F04A',
  position    double precision not null default 0,
  created_at  timestamptz not null default now()
);

create table if not exists items (
  id            text primary key,
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
  created_at    timestamptz not null default now()
);

create index if not exists items_position_idx on items (position);
create index if not exists items_collection_idx on items (collection_id);
