alter table items
  add column if not exists tags text[] not null default '{}';

create table if not exists achievements (
  key         text primary key,
  unlocked_at timestamptz not null default now()
);

create table if not exists user_stats (
  id         text primary key,
  visits     integer not null default 0,
  last_visit date
);
