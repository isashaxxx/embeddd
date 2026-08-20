import { NextResponse } from 'next/server';
import { db, uid } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const { name, color } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: 'Нужно название' }, { status: 400 });

  const sql = db();
  const [{ max }] = (await sql`select coalesce(max(position), 0) as max from collections`) as { max: number }[];
  const id = uid();
  await sql`insert into collections (id, name, color, position)
            values (${id}, ${name.trim()}, ${color || '#C6F04A'}, ${Number(max) + 1})`;
  const rows = (await sql`select * from collections where id = ${id}`) as unknown[];
  return NextResponse.json(rows[0]);
}
