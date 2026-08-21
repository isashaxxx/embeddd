import { NextResponse } from 'next/server';
import { db, slugify, uid } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const { name, color, description } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: 'Нужно название' }, { status: 400 });
  const sql = db();
  const [{ max }] = (await sql`select coalesce(max(position), 0) as max from projects`) as { max: number }[];
  const id = uid();
  const base = slugify(name);
  const same = (await sql`select count(*)::int as count from projects where slug = ${base} or slug like ${`${base}-%`}`) as unknown as { count: number }[];
  const slug = same[0].count ? `${base}-${same[0].count + 1}` : base;
  await sql`insert into projects (id, slug, name, color, position, description) values (${id}, ${slug}, ${name.trim()}, ${color || '#C6F04A'}, ${Number(max) + 1}, ${String(description || '').slice(0, 2000)})`;
  const rows = (await sql`select * from projects where id = ${id}`) as unknown[];
  return NextResponse.json(rows[0]);
}
