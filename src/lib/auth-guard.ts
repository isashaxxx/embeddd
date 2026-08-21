import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

/** Возвращает true, если запрос авторизован. */
export async function requireAuth(req: Request) {
  // Добавлено в middleware.ts: проверка cookie. Здесь защита на уровне API.
  // Если middleware пропущен (e.g. edge), fallback на cookie + verify.
  const cookieHeader = (req as Request).headers.get('cookie');
  if (!cookieHeader) return false;
  const match = cookieHeader.match(/(^|;\s*)embeddd_session=([^;]+)/);
  const token = match?.[2];
  if (!token) return false;
  // verify из auth.ts — используется в middleware.
  const { verify } = await import('@/lib/auth');
  return verify(token);
}

/** Простой auth-доступ для API роутов. */
export async function withAuth<T>(
  req: Request,
  handler: () => Promise<T>,
): Promise<T | NextResponse> {
  const ok = await requireAuth(req);
  if (!ok) return NextResponse.json({ error: 'Нужен вход' }, { status: 401 });
  return handler();
}
