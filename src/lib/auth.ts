import { SignJWT, jwtVerify } from 'jose';

const key = (secret: string) => new TextEncoder().encode(secret);
export const COOKIE = 'embeddd_session';

function authSecret() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('AUTH_SECRET is required in production');
    }
    return 'dev-secret-change-me';
  }
  return secret;
}

export async function sign() {
  return new SignJWT({ ok: true })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(key(authSecret()));
}

export async function verify(token?: string) {
  if (!token) return false;
  try {
    await jwtVerify(token, key(authSecret()));
    return true;
  } catch {
    return false;
  }
}
