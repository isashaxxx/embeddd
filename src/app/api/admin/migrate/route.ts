import { NextResponse } from 'next/server';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Прогоняет db/schema.sql и все migrations/*.sql внутри самого приложения,
 * там где DATABASE_URL реально доступен (в отличие от локального
 * `vercel env pull`, который не может скачать значения Sensitive-переменных).
 * Все операторы идемпотентны (if not exists / on conflict do nothing), так
 * что повторный вызов безопасен. Доступ уже защищён общей авторизацией сайта
 * (см. src/proxy.ts) — отдельный секрет не нужен.
 */
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
  return run();
}

export async function POST() {
  return run();
}
