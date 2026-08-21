import { NextResponse } from 'next/server';
import { maintainLibrary } from '@/lib/maintenance';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/** Планово чистит библиотеку (дубликаты в архив, протухший архив — из R2 и базы). Дёргается по Vercel Cron. */
export async function GET(req: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) return NextResponse.json({ error: 'Cron endpoint is disabled' }, { status: 404 });
  const provided = req.headers.get('authorization');
  if (provided !== `Bearer ${expected}`) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  await maintainLibrary();
  return NextResponse.json({ ok: true });
}
