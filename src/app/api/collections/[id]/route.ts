import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { deleteKeys } from '@/lib/r2';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const { name, color, position, accessMode, projectId } = await req.json();
  const sql = db();

  if (name !== undefined) await sql`update collections set name = ${name} where id = ${id}`;
  if (color !== undefined) await sql`update collections set color = ${color} where id = ${id}`;
  if (position !== undefined) await sql`update collections set position = ${position} where id = ${id}`;
  if (projectId !== undefined) await sql`update collections set project_id = ${projectId || null} where id = ${id}`;
  if (accessMode === 'private') await sql`update collections set access_mode = 'private', share_token = null where id = ${id}`;
  if (accessMode === 'link') await sql`
    update collections set access_mode = 'link', share_token = coalesce(share_token, ${crypto.randomUUID().replaceAll('-', '')}) where id = ${id}`;

  const rows = (await sql`select * from collections where id = ${id}`) as unknown[];
  return NextResponse.json(rows[0] ?? null);
}

/** Удаление борда удаляет и все его карточки, включая файлы в R2. */
export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const sql = db();
  const items = (await sql`select r2_key, r2_thumb_key from items where collection_id = ${id}`) as unknown as {
    r2_key: string | null;
    r2_thumb_key: string | null;
  }[];
  await sql`delete from items where collection_id = ${id}`;
  await sql`delete from collections where id = ${id}`;
  await deleteKeys(items.flatMap((item) => [item.r2_key, item.r2_thumb_key]).filter(Boolean) as string[]).catch(() => {});
  return NextResponse.json({ ok: true });
}
