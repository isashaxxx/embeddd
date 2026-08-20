import { readFileSync, readdirSync } from 'node:fs';
import { Client } from '@neondatabase/serverless';

const url = process.env.DATABASE_URL;
if (!url) { console.error('Нет DATABASE_URL. Запусти сначала: vercel env pull .env'); process.exit(1); }

const client = new Client(url);
await client.connect();
const sources = [
  new URL('../db/schema.sql', import.meta.url),
  ...readdirSync(new URL('../migrations/', import.meta.url))
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .map((name) => new URL(`../migrations/${name}`, import.meta.url)),
];
for (const source of sources) {
  const text = readFileSync(source, 'utf8');
  for (const stmt of text.split(';').map(s => s.trim()).filter(Boolean)) {
    await client.query(stmt);
  }
}
await client.end();
console.log('Схема применена.');
