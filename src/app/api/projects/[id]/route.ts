import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { deleteKeys } from '@/lib/r2';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };
const COLOR = /^#[0-9a-f]{6}$/i;

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  const { name, color, position, coverUrl, accessMode, description } = body;
  const sql = db();
  if (name !== undefined) {
    const value = String(name).trim().slice(0, 160);
    if (!value) return NextResponse.json({ error: 'Название не может быть пустым' }, { status: 400 });
    await sql`update projects set name = ${value} where id = ${id}`;
  }
  if (color !== undefined && COLOR.test(String(color))) await sql`update projects set color = ${String(color)} where id = ${id}`;
  if (description !== undefined) await sql`update projects set description = ${String(description).slice(0, 2000)} where id = ${id}`;
  if (position !== undefined && Number.isFinite(Number(position))) await sql`update projects set position = ${Number(position)} where id = ${id}`;
  if (coverUrl !== undefined) await sql`update projects set cover_url = ${coverUrl ? String(coverUrl).slice(0, 2048) : null} where id = ${id}`;
  if (accessMode === 'private') await sql`update projects set access_mode = 'private', share_token = null where id = ${id}`;
  if (accessMode === 'link') await sql`
    update projects set access_mode = 'link', share_token = coalesce(share_token, ${crypto.randomUUID().replaceAll('-', '')}) where id = ${id}`;
  const rows = (await sql`select * from projects where id = ${id}`) as unknown[];
  if (!rows[0]) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  return NextResponse.json(rows[0]);
}

/** Удаление проекта удаляет все его борды и все карточки в них, включая файлы в R2. */
export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const sql = db();
  const items = (await sql`
    select i.r2_key, i.r2_thumb_key from items i
    join collections c on c.id = i.collection_id
    where c.project_id = ${id}
  `) as unknown as { r2_key: string | null; r2_thumb_key: string | null }[];
  await sql`delete from items where collection_id in (select id from collections where project_id = ${id})`;
  await sql`delete from collections where project_id = ${id}`;
  const deleted = await sql`delete from projects where id = ${id} returning id` as unknown as { id: string }[];
  if (!deleted.length) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  await deleteKeys(items.flatMap((item) => [item.r2_key, item.r2_thumb_key]).filter(Boolean) as string[]).catch(() => {});
  return NextResponse.json({ ok: true });
}
