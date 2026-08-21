alter table items add column if not exists checklist jsonb not null default '[]'::jsonb;
