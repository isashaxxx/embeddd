import { NextResponse } from 'next/server';
import { db, slugify, uid } from '@/lib/db';
import { parseLink, unfurl } from '@/lib/parse';

export const dynamic = 'force-dynamic';
export const maxDuration = 15;

/**
 * Две ветки:
 *  { url, collectionId }              — ссылка, сервер сам распознаёт и тянет og:image
 *  { upload: {...}, collectionId }    — файл, уже залитый браузером в R2
 *  { block: {...}, collectionId }     — текстовый или HTML-блок
 */
export async function POST(req: Request) {
  const sql = db();
  const body = await req.json();
  const collectionId: string | null = body.collectionId || null;

  // позиция: наверх стены
  const [{ min }] = (await sql`select coalesce(min(position), 0) as min from items`) as { min: number }[];
  const position = Number(min) - 1;
  const id = uid();
  async function itemSlug(value: string) {
    const base = slugify(value);
    const same = (await sql`select count(*)::int as count from items where slug = ${base} or slug like ${`${base}-%`}`) as unknown as { count: number }[];
    return same[0].count ? `${base}-${same[0].count + 1}` : base;
  }

  if (body.upload) {
    const u = body.upload;
    await sql`
      insert into items (id, slug, collection_id, kind, provider, position, src, thumb, width, height,
                         r2_key, r2_thumb_key, title)
      values (${id}, ${await itemSlug(u.title || 'image')}, ${collectionId}, ${u.kind}, 'local', ${position}, ${u.src}, ${u.thumb ?? u.src},
              ${u.width ?? null}, ${u.height ?? null}, ${u.key}, ${u.thumbKey ?? null}, ${u.title ?? ''})`;
    return NextResponse.json(await one(id));
  }

  if (body.block) {
    const allowed = new Set(['text', 'heading', 'callout', 'html', 'divider']);
    const kind = String(body.block.kind || '');
    if (!allowed.has(kind)) return NextResponse.json({ error: 'Неизвестный тип блока' }, { status: 400 });
    const title = String(body.block.title || '').slice(0, 500);
    const note = String(body.block.note || '').slice(0, 100000);
    await sql`
      insert into items (id, slug, collection_id, kind, provider, position, embed_h, title, note, display_size, text_style)
      values (${id}, ${await itemSlug(title || kind)}, ${collectionId}, ${kind}, 'block', ${position}, ${kind === 'html' ? 280 : null}, ${title}, ${note},
              ${['S', 'M', 'L'].includes(String(body.block.displaySize)) ? String(body.block.displaySize) : 'S'}, ${String(body.block.textStyle || 'p')})`;
    return NextResponse.json(await one(id));
  }

  const p = parseLink(String(body.url || ''));
  if (!p) return NextResponse.json({ error: 'Не похоже на ссылку' }, { status: 400 });

  // для закладок и картинок подтягиваем превью со страницы
  let title = p.title || '';
  let thumb = p.thumb || null;
  if (p.kind === 'link') {
    const meta = await unfurl(p.url);
    if (meta.title) title = meta.title;
    if (meta.thumb) thumb = meta.thumb;
  }

  await sql`
    insert into items (id, slug, collection_id, kind, provider, position, url, host,
                       embed_url, embed_h, ratio, src, thumb, title)
    values (${id}, ${await itemSlug(title || p.host || 'link')}, ${collectionId}, ${p.kind}, ${p.provider}, ${position}, ${p.url}, ${p.host},
            ${p.embedUrl ?? null}, ${p.embedH ?? null}, ${p.ratio ?? null},
            ${p.src ?? null}, ${thumb}, ${title})`;

  return NextResponse.json(await one(id));
}

async function one(id: string) {
  const rows = (await db()`select * from items where id = ${id}`) as unknown[];
  return rows[0];
}
