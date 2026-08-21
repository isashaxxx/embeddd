import { NextResponse } from 'next/server';
import { COOKIE, verify } from '@/lib/auth';

/** Возвращает true, если запрос авторизован. */
export async function requireAuth(req: Request) {
  // Дублирует проверку middleware (proxy.ts) на уровне API — defense in depth,
  // если матчер middleware когда-нибудь снова изменят так, что роут окажется
  // не защищён.
  const cookieHeader = req.headers.get('cookie');
  if (!cookieHeader) return false;
  const match = cookieHeader.match(new RegExp(`(^|;\\s*)${COOKIE}=([^;]+)`));
  const token = match?.[2];
  if (!token) return false;
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
