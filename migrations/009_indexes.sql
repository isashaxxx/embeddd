alter table items add column if not exists tags text[] not null default '{}';
create index if not exists items_tags_idx on items using gin (tags);
create index if not exists items_fav_idx on items (fav) where fav;
