alter table items add column if not exists archived_at timestamptz;
alter table items add column if not exists content_hash text;
create index if not exists items_archived_idx on items (archived_at);
create index if not exists items_content_hash_idx on items (content_hash);
