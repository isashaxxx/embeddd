import { NextResponse, type NextRequest } from 'next/server';
import { COOKIE, verify } from '@/lib/auth';

export async function proxy(req: NextRequest) {
  const ok = await verify(req.cookies.get(COOKIE)?.value);
  const { pathname } = req.nextUrl;

  if (pathname.startsWith('/c/')) return NextResponse.next();

  if (ok && pathname === '/login') return NextResponse.redirect(new URL('/', req.url));
  if (ok) return NextResponse.next();

  if (pathname.startsWith('/api'))
    return NextResponse.json({ error: 'Нужен вход' }, { status: 401 });

  return NextResponse.redirect(new URL('/login', req.url));
}

export const config = {
  matcher: ['/((?!login|api/auth|_next/static|_next/image|favicon.ico|manifest.webmanifest|icon.svg|logo.svg).*)'],
};
