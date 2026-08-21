import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/auth-guard';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const ok = await requireAuth(req);
  if (!ok) return NextResponse.json({ error: 'Нужен вход' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const ids = body?.ids;
  const collectionId = body?.collectionId;
  if (!Array.isArray(ids) || !ids.length || ids.length > 1000) return NextResponse.json({ error: 'Некорректный порядок' }, { status: 400 });
  const cleanIds = ids.map(String);
  if (new Set(cleanIds).size !== cleanIds.length) return NextResponse.json({ error: 'Порядок содержит дубликаты' }, { status: 400 });

  const sql = db();
  const rows = (await sql`select id, collection_id, position from items where id = any(${cleanIds})`) as unknown as { id: string; collection_id: string | null; position: number }[];
  if (rows.length !== cleanIds.length) return NextResponse.json({ error: 'Часть элементов не найдена' }, { status: 400 });

  // Board-safe: если collectionId не передан явно, все карточки должны быть
  // из одного борда — иначе непонятно, в каком контексте меняется порядок.
  if (collectionId === undefined) {
    const boardsInPlay = new Set(rows.map((item) => item.collection_id || '__none__'));
    if (boardsInPlay.size !== 1) return NextResponse.json({ error: 'Нельзя менять порядок элементов из разных бордов одним запросом' }, { status: 400 });
  }

  // Один UPDATE на весь новый порядок вместо цикла: на большом борде цикл из
  // N запросов на каждый drag быстро упирается в таймаут функции.
  const slots = rows.map((item) => Number(item.position)).sort((a, b) => a - b);
  await sql`
    update items as i set position = v.position
    from (select unnest(${cleanIds}::text[]) as id, unnest(${slots}::double precision[]) as position) as v
    where i.id = v.id`;

  // Если передан collectionId — массово переносим карточки в борд одним запросом.
  if (collectionId !== undefined) {
    const target = collectionId || null;
    if (target) {
      const board = (await sql`select id from collections where id = ${target} limit 1`) as unknown as { id: string }[];
      if (!board.length) return NextResponse.json({ error: 'Борд назначения не найден' }, { status: 400 });
    }
    await sql`update items set collection_id = ${target} where id = any(${cleanIds})`;
  }

  return NextResponse.json({ ok: true });
}
