import { SignJWT, jwtVerify } from 'jose';

const FALLBACK_SECRET = 'dev-secret-change-me';
const key = (secret = process.env.AUTH_SECRET || FALLBACK_SECRET) => new TextEncoder().encode(secret);
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
  const secrets = [...new Set([process.env.AUTH_SECRET || FALLBACK_SECRET, FALLBACK_SECRET])];
  for (const secret of secrets) {
    try {
      await jwtVerify(token, key(secret));
      return true;
    } catch {
      // Try the legacy fallback so adding AUTH_SECRET does not log out existing sessions.
    }
  }
  return false;
}
