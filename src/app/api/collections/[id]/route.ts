import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

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

/** Коллекция удаляется, карточки остаются — просто выпадают во «Всё». */
export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  await db()`delete from collections where id = ${id}`;
  return NextResponse.json({ ok: true });
}
