create table if not exists account_profile (
  id text primary key,
  nickname text not null default 'embeddd',
  email text not null default '',
  avatar_url text,
  role text not null default 'owner',
  permissions text[] not null default array['manage_content','manage_projects','manage_ai','manage_account']::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
insert into account_profile (id) values ('main') on conflict (id) do nothing;
