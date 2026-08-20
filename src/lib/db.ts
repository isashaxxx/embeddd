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

const cyrillic: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', ґ: 'g', д: 'd', е: 'e', ё: 'yo', є: 'ye', ж: 'zh', з: 'z',
  и: 'i', і: 'i', ї: 'yi', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
  с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y',
  ь: '', э: 'e', ю: 'yu', я: 'ya',
};

export function slugify(value: string) {
  const transliterated = [...value.toLocaleLowerCase()].map((character) => cyrillic[character] ?? character).join('');
  const base = transliterated.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 54) || 'item';
  return base;
}
