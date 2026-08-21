import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { deleteKeys } from '@/lib/r2';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };
const COLOR = /^#[0-9a-f]{6}$/i;

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Некорректные данные' }, { status: 400 });
  const { name, color, position, accessMode, projectId } = body as Record<string, unknown>;
  const sql = db();

  const exists = (await sql`select id from collections where id = ${id} limit 1`) as unknown as { id: string }[];
  if (!exists.length) return NextResponse.json({ error: 'Борд не найден' }, { status: 404 });

  if (name !== undefined) {
    const value = String(name).trim().slice(0, 160);
    if (!value) return NextResponse.json({ error: 'Название не может быть пустым' }, { status: 400 });
    await sql`update collections set name = ${value} where id = ${id}`;
  }
  if (color !== undefined) {
    const value = String(color);
    if (!COLOR.test(value)) return NextResponse.json({ error: 'Некорректный цвет' }, { status: 400 });
    await sql`update collections set color = ${value} where id = ${id}`;
  }
  if (position !== undefined) {
    const value = Number(position);
    if (!Number.isFinite(value)) return NextResponse.json({ error: 'Некорректная позиция' }, { status: 400 });
    await sql`update collections set position = ${value} where id = ${id}`;
  }
  if (projectId !== undefined) {
    const target = projectId ? String(projectId) : null;
    if (target) {
      const project = (await sql`select id from projects where id = ${target} limit 1`) as unknown as { id: string }[];
      if (!project.length) return NextResponse.json({ error: 'Проект назначения не найден' }, { status: 400 });
    }
    await sql`update collections set project_id = ${target} where id = ${id}`;
  }
  if (accessMode !== undefined && accessMode !== 'private' && accessMode !== 'link') return NextResponse.json({ error: 'Некорректный режим доступа' }, { status: 400 });
  if (accessMode === 'private') await sql`update collections set access_mode = 'private', share_token = null where id = ${id}`;
  if (accessMode === 'link') await sql`update collections set access_mode = 'link', share_token = coalesce(share_token, ${crypto.randomUUID().replaceAll('-', '')}) where id = ${id}`;

  const rows = (await sql`select * from collections where id = ${id}`) as unknown[];
  return NextResponse.json(rows[0]);
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const sql = db();
  const items = (await sql`select id, r2_key, r2_thumb_key from items where collection_id = ${id}`) as unknown as { id: string; r2_key: string | null; r2_thumb_key: string | null }[];
  const exists = (await sql`select id from collections where id = ${id} limit 1`) as unknown as { id: string }[];
  if (!exists.length) return NextResponse.json({ error: 'Борд не найден' }, { status: 404 });

  // Удаляем карточки до борда, чтобы ON DELETE SET NULL не превращал их в сирот.
  await sql`delete from items where collection_id = ${id}`;
  await sql`delete from collections where id = ${id}`;
  await deleteKeys(items.flatMap((item) => [item.r2_key, item.r2_thumb_key]).filter(Boolean) as string[]).catch(() => {});
  return NextResponse.json({ ok: true });
}
