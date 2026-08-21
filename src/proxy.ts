import { NextResponse, type NextRequest } from 'next/server';
import { COOKIE, verify } from '@/lib/auth';

export async function proxy(req: NextRequest) {
  const ok = await verify(req.cookies.get(COOKIE)?.value);
  const { pathname } = req.nextUrl;

  // Публичные роуты — не требуют auth.
  if (pathname.startsWith('/c/') || pathname.startsWith('/login') || pathname.startsWith('/api/auth')) {
    if (ok && pathname === '/login') return NextResponse.redirect(new URL('/', req.url));
    return NextResponse.next();
  }

  // /api/progress и /api/state — публичные для гостей.
  if (pathname === '/api/progress' || pathname === '/api/state') return NextResponse.next();

  if (ok) return NextResponse.next();

  if (pathname.startsWith('/api')) {
    return NextResponse.json({ error: 'Нужен вход' }, { status: 401 });
  }

  // Редирект на логин — сохраняем намерение.
  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.searchParams.set('callbackUrl', pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    '/((?!login|api/auth|c/|_next/static|_next/image|favicon.ico|manifest.webmanifest|icon.svg|logo.svg).*)',
  ],
};
