alter table collections
  add column if not exists access_mode text not null default 'private';

alter table collections
  add column if not exists share_token text;

create unique index if not exists collections_share_token_idx
  on collections (share_token)
  where share_token is not null;
