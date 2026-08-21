import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/auth-guard';

export const dynamic = 'force-dynamic';

// Отдаёт весь борд владельца целиком — не публичный эндпоинт. proxy.ts уже
// требует сессию для всех /api/*, здесь — defense in depth.
export async function GET(req: Request) {
  const ok = await requireAuth(req);
  if (!ok) return NextResponse.json({ error: 'Нужен вход' }, { status: 401 });

  const sql = db();
  const [collections, items] = await Promise.all([
    sql`select * from collections order by position asc, created_at asc`,
    sql`select * from items order by position asc`,
  ]);
  return NextResponse.json({ collections, items });
}
