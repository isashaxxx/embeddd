import { NextResponse } from 'next/server';
import { db, uid } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const { name, color, accessMode, projectId } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: 'Нужно название' }, { status: 400 });

  const sql = db();
  const [{ max }] = (await sql`select coalesce(max(position), 0) as max from collections`) as { max: number }[];
  const id = uid();
  const mode = accessMode === 'link' ? 'link' : 'private';
  const shareToken = mode === 'link' ? crypto.randomUUID().replaceAll('-', '') : null;
  await sql`insert into collections (id, name, color, position, access_mode, share_token, project_id)
            values (${id}, ${name.trim()}, ${color || '#C6F04A'}, ${Number(max) + 1}, ${mode}, ${shareToken}, ${projectId || null})`;
  const rows = (await sql`select * from collections where id = ${id}`) as unknown[];
  return NextResponse.json(rows[0]);
}
