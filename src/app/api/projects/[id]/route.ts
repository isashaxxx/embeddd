import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const { name, color, position } = await req.json();
  const sql = db();
  if (name !== undefined) await sql`update projects set name = ${name} where id = ${id}`;
  if (color !== undefined) await sql`update projects set color = ${color} where id = ${id}`;
  if (position !== undefined) await sql`update projects set position = ${position} where id = ${id}`;
  const rows = (await sql`select * from projects where id = ${id}`) as unknown[];
  return NextResponse.json(rows[0] ?? null);
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  await db()`delete from projects where id = ${id}`;
  return NextResponse.json({ ok: true });
}
