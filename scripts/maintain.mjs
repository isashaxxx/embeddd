#!/usr/bin/env node
import { createHmac } from 'node:crypto';
import { Client } from '@neondatabase/serverless';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL не задан');

function signedDeleteUrl(key) {
  const expires = Math.floor(Date.now() / 1000) + 600;
  const sig = createHmac('sha256', process.env.MEDIA_SIGNING_SECRET)
    .update(`DELETE\n${key}\n${expires}`)
    .digest('hex');
  return `${process.env.R2_PUBLIC_URL}/${key}?expires=${expires}&sig=${sig}`;
}

async function deleteKeys(keys) {
  const list = keys.filter(Boolean);
  if (!list.length) return;
  await Promise.all(list.map((key) => fetch(signedDeleteUrl(key), { method: 'DELETE' })));
}

const client = new Client(url);
await client.connect();

await client.query(`
  with ranked as (
    select id, row_number() over (partition by content_hash order by created_at, id) as duplicate_number
    from items where content_hash is not null and archived_at is null and content_hash != ''
  )
  update items set archived_at = now()
  where id in (select id from ranked where duplicate_number > 1)`);
console.log('Дубли архивированы.');

const expired = await client.query(`
  select id, r2_key, r2_thumb_key from items
  where archived_at is not null and archived_at < now() - interval '30 days'`);
if (expired.rowCount) {
  console.log(`Удаляю ${expired.rowCount} просроченных элементов.`);
  await deleteKeys(expired.rows.flatMap((row) => [row.r2_key, row.r2_thumb_key]));
  await client.query('delete from items where id = any($1::text[])', [expired.rows.map((row) => row.id)]);
  console.log('Удалены записи и файлы в R2.');
} else {
  console.log('Просроченных элементов нет.');
}

await client.end();
