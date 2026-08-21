import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { deleteKeys } from '@/lib/r2';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const p = await req.json().catch(() => null);
  if (!p || typeof p !== 'object') return NextResponse.json({ error: 'Некорректные данные' }, { status: 400 });
  const sql = db();
  const exists = (await sql`select id from items where id = ${id} limit 1`) as unknown as { id: string }[];
  if (!exists.length) return NextResponse.json({ error: 'Элемент не найден' }, { status: 404 });

  if ('title' in p) await sql`update items set title = ${String(p.title ?? '').slice(0, 500)} where id = ${id}`;
  if ('note' in p) await sql`update items set note = ${String(p.note ?? '').slice(0, 100000)} where id = ${id}`;
  if ('fav' in p) await sql`update items set fav = ${!!p.fav} where id = ${id}`;
  if ('url' in p) {
    const value = String(p.url ?? '').trim();
    if (value && !/^https?:\/\//i.test(value)) return NextResponse.json({ error: 'Некорректная ссылка' }, { status: 400 });
    await sql`update items set url = ${value || null} where id = ${id}`;
  }
  if ('position' in p) {
    const value = Number(p.position);
    if (!Number.isFinite(value)) return NextResponse.json({ error: 'Некорректная позиция' }, { status: 400 });
    await sql`update items set position = ${value} where id = ${id}`;
  }
  if ('embedH' in p) {
    const value = Number(p.embedH);
    if (!Number.isFinite(value) || value < 80 || value > 4000) return NextResponse.json({ error: 'Некорректная высота' }, { status: 400 });
    await sql`update items set embed_h = ${Math.round(value)} where id = ${id}`;
  }
  if ('collectionId' in p) {
    const target = p.collectionId ? String(p.collectionId) : null;
    if (target) {
      const board = (await sql`select id from collections where id = ${target} limit 1`) as unknown as { id: string }[];
      if (!board.length) return NextResponse.json({ error: 'Борд назначения не найден' }, { status: 400 });
    }
    await sql`update items set collection_id = ${target} where id = ${id}`;
  }
  if ('archived' in p) await sql`update items set archived_at = ${p.archived ? new Date().toISOString() : null} where id = ${id}`;
  if ('displaySize' in p) {
    if (!['XS', 'S', 'M', 'L', 'XL'].includes(String(p.displaySize))) return NextResponse.json({ error: 'Некорректный размер' }, { status: 400 });
    await sql`update items set display_size = ${String(p.displaySize)} where id = ${id}`;
  }
  if ('textStyle' in p) {
    if (!['p', 'h1', 'h2', 'h3', 'h4', 'h5'].includes(String(p.textStyle))) return NextResponse.json({ error: 'Некорректный стиль текста' }, { status: 400 });
    await sql`update items set text_style = ${String(p.textStyle)} where id = ${id}`;
  }
  if ('tags' in p) {
    if (!Array.isArray(p.tags)) return NextResponse.json({ error: 'Некорректные теги' }, { status: 400 });
    const tags = [...new Set(p.tags.map((tag: unknown) => String(tag).trim().toLocaleLowerCase().slice(0, 60)).filter(Boolean))].slice(0, 12);
    await sql`update items set tags = ${tags} where id = ${id}`;
  }
  if ('checklist' in p) {
    if (!Array.isArray(p.checklist)) return NextResponse.json({ error: 'Некорректный чек-лист' }, { status: 400 });
    const checklist = p.checklist.slice(0, 100).map((entry: unknown) => {
      const value = entry as { id?: unknown; text?: unknown; done?: unknown };
      return { id: String(value.id || '').slice(0, 100), text: String(value.text || '').slice(0, 300), done: !!value.done };
    }).filter((entry: { id: string }) => entry.id);
    await sql`update items set checklist = ${JSON.stringify(checklist)}::jsonb where id = ${id}`;
  }

  const rows = (await sql`select * from items where id = ${id}`) as unknown[];
  return NextResponse.json(rows[0]);
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const sql = db();
  const rows = (await sql`select r2_key, r2_thumb_key from items where id = ${id}`) as { r2_key: string | null; r2_thumb_key: string | null }[];
  if (!rows.length) return NextResponse.json({ error: 'Элемент не найден' }, { status: 404 });
  await sql`delete from items where id = ${id}`;
  const keys = [rows[0]?.r2_key, rows[0]?.r2_thumb_key].filter(Boolean) as string[];
  if (keys.length) await deleteKeys(keys).catch((error) => console.error('R2 delete failed', error));
  return NextResponse.json({ ok: true });
}
