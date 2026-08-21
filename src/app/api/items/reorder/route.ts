import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const ids = body?.ids;
  if (!Array.isArray(ids) || !ids.length || ids.length > 1000) return NextResponse.json({ error: 'Некорректный порядок' }, { status: 400 });
  const cleanIds = ids.map(String);
  if (new Set(cleanIds).size !== cleanIds.length) return NextResponse.json({ error: 'Порядок содержит дубликаты' }, { status: 400 });

  const sql = db();
  const rows = (await sql`select id, collection_id, position from items where id = any(${cleanIds})`) as unknown as { id: string; collection_id: string | null; position: number }[];
  if (rows.length !== cleanIds.length) return NextResponse.json({ error: 'Часть элементов не найдена' }, { status: 400 });

  const collections = new Set(rows.map((item) => item.collection_id || '__none__'));
  if (collections.size !== 1) return NextResponse.json({ error: 'Нельзя менять порядок элементов из разных бордов одним запросом' }, { status: 400 });

  const slots = rows.map((item) => Number(item.position)).sort((a, b) => a - b);
  for (let index = 0; index < cleanIds.length; index++) {
    await sql`update items set position = ${slots[index]} where id = ${cleanIds[index]}`;
  }
  return NextResponse.json({ ok: true });
}
