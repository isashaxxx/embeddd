#!/usr/bin/env node
import { Client } from '@neondatabase/serverless';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL не задан');
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
}
await client.end();
