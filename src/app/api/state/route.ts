import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const sql = db();
  const [collections, items] = await Promise.all([
    sql`select * from collections order by position asc, created_at asc`,
    sql`select * from items order by position asc`,
  ]);
  return NextResponse.json({ collections, items });
}
