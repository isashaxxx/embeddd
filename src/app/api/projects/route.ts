import { NextResponse } from 'next/server';
import { db, slugify, uid } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const { name, color } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: 'Нужно название' }, { status: 400 });
  const sql = db();
  const [{ max }] = (await sql`select coalesce(max(position), 0) as max from projects`) as { max: number }[];
  const id = uid();
  const slug = slugify(name, id);
  await sql`insert into projects (id, slug, name, color, position) values (${id}, ${slug}, ${name.trim()}, ${color || '#C6F04A'}, ${Number(max) + 1})`;
  const rows = (await sql`select * from projects where id = ${id}`) as unknown[];
  return NextResponse.json(rows[0]);
}
