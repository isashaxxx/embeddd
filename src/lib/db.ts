import { neon } from '@neondatabase/serverless';

let _sql: ReturnType<typeof neon> | null = null;

/** Ленивый клиент: без него сборка падала бы без DATABASE_URL. */
export function db() {
  if (!_sql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL не задан');
    _sql = neon(url);
  }
  return _sql;
}

export const uid = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export function slugify(value: string, id = uid()) {
  const base = value.toLocaleLowerCase().normalize('NFKD').replace(/[^\p{Letter}\p{Number}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 54) || 'item';
  return `${base}-${id.slice(-7)}`;
}
