alter table projects add column if not exists access_mode text not null default 'private';
alter table projects add column if not exists share_token text;
