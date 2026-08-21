import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/auth-guard';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const ok = await requireAuth(req);
  if (!ok) return NextResponse.json({ error: 'Нужен вход' }, { status: 401 });

  const sql = db();
  const body = await req.json().catch(() => null);
  const { ids, collectionId } = body || {};

  const idsArr = Array.isArray(ids) ? ids.map(String) : null;
  if (!idsArr || !idsArr.length || idsArr.length > 1000) {
    return NextResponse.json({ error: 'Некорректный порядок' }, { status: 400 });
  }

  const cleanIds = idsArr.filter(Boolean);
  if (cleanIds.length !== new Set(cleanIds).size) {
    return NextResponse.json({ error: 'Порядок содержит дубликаты' }, { status: 400 });
  }

  // Board-safe: если collectionId не передан — проверяем единообразие бордов.
  if (collectionId === undefined) {
    const rows = (await sql`select id, collection_id from items where id = any(${cleanIds})`) as unknown as { id: string; collection_id: string | null }[];
    if (rows.length !== cleanIds.length) return NextResponse.json({ error: 'Часть элементов не найдена' }, { status: 400 });

    const collections = new Set(rows.map((item) => item.collection_id || '__none__'));
    if (collections.size !== 1) return NextResponse.json({ error: 'Нельзя менять порядок элементов из разных бордов одним запросом' }, { status: 400 });
  }

  // Bulk UPDATE positions: параллельные update по индексу — без загрузки всех rows.
  await Promise.all(
    cleanIds.map((id, idx) => sql`update items set position = ${idx} where id = ${id}`),
  );

  // Если передан collectionId — массово переносим карточки в коллекцию.
  if (collectionId !== undefined) {
    await Promise.all(
      cleanIds.map((id) => sql`update items set collection_id = ${collectionId || null} where id = ${id}`),
    );
  }

  return NextResponse.json({ ok: true });
}
