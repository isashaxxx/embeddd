import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/auth-guard';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  // /api/state — публичный endpoint для публичных коллекций.
  return _GET();
}

async function _GET() {
  const sql = db();
  const [collections, items] = await Promise.all([
    sql`select * from collections order by position asc, created_at asc`,
    sql`select * from items order by position asc`,
  ]);
  return NextResponse.json({ collections, items });
}

export async function POST(req: Request) {
  const ok = await requireAuth(req);
  if (!ok) return NextResponse.json({ error: 'Нужен вход' }, { status: 401 });

  const sql = db();
  const { slug, value } = await req.json();
  if (!slug || typeof value !== 'string' || value.length > 1000) {
    return NextResponse.json({ error: 'Неверный запрос' }, { status: 400 });
  }

  // Обновляем позицию проекта/коллекции по slug.
  await sql`update projects set position = ${Number(value)} where slug = ${slug}`;
  await sql`update collections set position = ${Number(value)} where slug = ${slug}`;
  return NextResponse.json({ ok: true });
}
