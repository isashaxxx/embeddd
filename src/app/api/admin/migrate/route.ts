import { NextResponse } from 'next/server';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

async function run() {
  const sql = db();
  const root = process.cwd();
  const files = [
    path.join(root, 'db/schema.sql'),
    ...readdirSync(path.join(root, 'migrations'))
      .filter((name) => name.endsWith('.sql'))
      .sort()
      .map((name) => path.join(root, 'migrations', name)),
  ];
  const applied: string[] = [];
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    for (const stmt of text.split(';').map((s) => s.trim()).filter(Boolean)) {
      await sql(stmt);
    }
    applied.push(path.basename(file));
  }
  return NextResponse.json({ ok: true, applied });
}

export async function GET() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405, headers: { Allow: 'POST' } });
}

export async function POST(req: Request) {
  const expected = process.env.ADMIN_MIGRATION_SECRET;
  if (!expected) return NextResponse.json({ error: 'Migration endpoint is disabled' }, { status: 404 });
  const provided = req.headers.get('x-migration-secret');
  if (!provided || provided !== expected) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  return run();
}
