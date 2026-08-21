import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { deleteKeys } from '@/lib/r2';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const p = await req.json();
  const sql = db();

  if ('title' in p) await sql`update items set title = ${p.title} where id = ${id}`;
  if ('note' in p) await sql`update items set note = ${p.note} where id = ${id}`;
  if ('fav' in p) await sql`update items set fav = ${p.fav} where id = ${id}`;
  if ('url' in p) await sql`update items set url = ${p.url} where id = ${id}`;
  if ('position' in p) await sql`update items set position = ${p.position} where id = ${id}`;
  if ('embedH' in p) await sql`update items set embed_h = ${p.embedH} where id = ${id}`;
  if ('collectionId' in p) await sql`update items set collection_id = ${p.collectionId} where id = ${id}`;
  if ('archived' in p) await sql`update items set archived_at = ${p.archived ? new Date().toISOString() : null} where id = ${id}`;
  if ('displaySize' in p && ['XS', 'S', 'M', 'L', 'XL'].includes(p.displaySize))
    await sql`update items set display_size = ${p.displaySize} where id = ${id}`;
  if ('textStyle' in p && ['p', 'h1', 'h2', 'h3', 'h4', 'h5'].includes(p.textStyle))
    await sql`update items set text_style = ${p.textStyle} where id = ${id}`;
  if ('tags' in p && Array.isArray(p.tags)) {
    const tags = [...new Set(p.tags.map((tag: unknown) => String(tag).trim().toLocaleLowerCase()).filter(Boolean))].slice(0, 12);
    await sql`update items set tags = ${tags} where id = ${id}`;
  }
  if ('checklist' in p && Array.isArray(p.checklist)) {
    const checklist = p.checklist.slice(0, 100).map((entry: unknown) => {
      const value = entry as { id?: unknown; text?: unknown; done?: unknown };
      return { id: String(value.id || ''), text: String(value.text || '').slice(0, 300), done: !!value.done };
    }).filter((entry: { id: string }) => entry.id);
    await sql`update items set checklist = ${JSON.stringify(checklist)}::jsonb where id = ${id}`;
  }

  const rows = (await sql`select * from items where id = ${id}`) as unknown[];
  return NextResponse.json(rows[0] ?? null);
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const sql = db();
  const rows = (await sql`select r2_key, r2_thumb_key from items where id = ${id}`) as {
    r2_key: string | null;
    r2_thumb_key: string | null;
  }[];

  await sql`delete from items where id = ${id}`;

  const keys = [rows[0]?.r2_key, rows[0]?.r2_thumb_key].filter(Boolean) as string[];
  if (keys.length) await deleteKeys(keys).catch(() => {});

  return NextResponse.json({ ok: true });
}
