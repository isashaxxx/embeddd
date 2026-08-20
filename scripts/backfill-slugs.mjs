import { Client } from '@neondatabase/serverless';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL не задан');
const client = new Client(url);
await client.connect();

const slugify = (value) => String(value || 'item').toLocaleLowerCase().normalize('NFKD').replace(/[^\p{Letter}\p{Number}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 54) || 'item';
for (const [table, label] of [['projects', 'name'], ['collections', 'name'], ['items', 'title']]) {
  const { rows } = await client.query(`select id, ${label} as label from ${table} order by created_at asc`);
  const used = new Set();
  for (const row of rows) {
    const base = slugify(row.label);
    let slug = base;
    let suffix = 2;
    while (used.has(slug)) slug = `${base}-${suffix++}`;
    used.add(slug);
    await client.query(`update ${table} set slug = $1 where id = $2`, [slug, row.id]);
  }
}
await client.end();
console.log('Человеческие slug обновлены.');
