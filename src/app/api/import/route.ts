import { NextResponse } from 'next/server';
import { db, uid } from '@/lib/db';
import { requireAuth } from '@/lib/auth-guard';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const ok = await requireAuth(req);
  if (!ok) return NextResponse.json({ error: 'Нужен вход' }, { status: 401 });

  const sql = db();
  const data = await req.json();
  const st = data?.state;
  if (!st?.items) return NextResponse.json({ error: 'Не тот файл' }, { status: 400 });

  const map = new Map<string, string>();
  let pos = 0;
  let skipped = 0;

  for (const c of st.collections || []) {
    const id = uid();
    map.set(c.id, id);
    await sql`insert into collections (id, name, color, position) values (${id}, ${c.name}, ${c.color || '#C6F04A'}, ${pos++})`;
  }

  let added = 0;
  for (const it of st.items) {
    if (it.local) { skipped++; continue; }
    await sql`
      insert into items (id, collection_id, kind, provider, position, fav, url, host,
                         embed_url, embed_h, ratio, src, thumb, title, note)
      values (${uid()}, ${it.collectionId ? map.get(it.collectionId) ?? null : null},
              ${it.kind}, ${it.provider ?? null}, ${added}, ${!!it.fav}, ${it.url ?? null}, ${it.host ?? null},
              ${it.embed ?? null}, ${it.h ?? null}, ${it.ratio ?? null},
              ${it.kind === 'image' || it.kind === 'video' ? it.url ?? null : null},
              ${it.thumb ?? null}, ${it.title ?? ''}, ${it.note ?? ''})`;
    added++;
  }

  return NextResponse.json({ added, skipped });
}
