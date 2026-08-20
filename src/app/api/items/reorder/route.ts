import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const { ids } = await req.json();
  if (!Array.isArray(ids) || ids.length > 1000) return NextResponse.json({ error: 'Некорректный порядок' }, { status: 400 });
  const cleanIds = ids.map(String);
  const sql = db();
  const all = (await sql`select id, position from items`) as { id: string; position: number }[];
  const wanted = new Set(cleanIds);
  const slots = all.filter((item) => wanted.has(item.id)).map((item) => Number(item.position)).sort((a, b) => a - b);
  for (let index = 0; index < cleanIds.length; index++) {
    await sql`update items set position = ${slots[index] ?? index} where id = ${cleanIds[index]}`;
  }
  return NextResponse.json({ ok: true });
}
