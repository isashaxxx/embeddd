import { SignJWT, jwtVerify } from 'jose';

const key = () => new TextEncoder().encode(process.env.AUTH_SECRET || 'dev-secret-change-me');
export const COOKIE = 'embeddd_session';

export async function sign() {
  return new SignJWT({ ok: true })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('365d')
    .sign(key());
}

export async function verify(token?: string) {
  if (!token) return false;
  try {
    await jwtVerify(token, key());
    return true;
  } catch {
    return false;
  }
}
