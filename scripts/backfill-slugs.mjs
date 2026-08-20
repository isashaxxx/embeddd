import { Client } from '@neondatabase/serverless';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL не задан');
const client = new Client(url);
await client.connect();

const cyrillic = { а:'a',б:'b',в:'v',г:'g',ґ:'g',д:'d',е:'e',ё:'yo',є:'ye',ж:'zh',з:'z',и:'i',і:'i',ї:'yi',й:'y',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'h',ц:'ts',ч:'ch',ш:'sh',щ:'sch',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya' };
const slugify = (value) => [...String(value || 'item').toLocaleLowerCase()].map((character) => cyrillic[character] ?? character).join('').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 54) || 'item';
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
