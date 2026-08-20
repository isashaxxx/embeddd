create table if not exists projects (
  id text primary key,
  name text not null,
  color text not null default '#C6F04A',
  position double precision not null default 0,
  created_at timestamptz not null default now()
);

alter table collections add column if not exists project_id text references projects(id) on delete set null;
create index if not exists collections_project_idx on collections (project_id);
