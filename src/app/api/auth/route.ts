import { NextResponse } from 'next/server';
import { COOKIE, sign } from '@/lib/auth';

export async function POST(req: Request) {
  const { password } = await req.json().catch(() => ({ password: '' }));
  const expected = process.env.APP_PASSWORD;

  if (!expected) return NextResponse.json({ error: 'APP_PASSWORD не задан на сервере' }, { status: 500 });
  if (password !== expected) return NextResponse.json({ error: 'Пароль не подошёл' }, { status: 401 });

  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, await sign(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, '', { path: '/', maxAge: 0 });
  return res;
}
