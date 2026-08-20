import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';
const allowedPermissions = new Set(['manage_content', 'manage_projects', 'manage_ai', 'manage_account']);

async function getAccount() {
  const sql = db();
  await sql`insert into account_profile (id) values ('main') on conflict (id) do nothing`;
  const rows = (await sql`select * from account_profile where id = 'main'`) as unknown[];
  return rows[0];
}

export async function GET() { return NextResponse.json(await getAccount()); }

export async function PATCH(req: Request) {
  const body = await req.json();
  const sql = db();
  await getAccount();
  if ('nickname' in body) await sql`update account_profile set nickname = ${String(body.nickname).trim().slice(0, 60)}, updated_at = now() where id = 'main'`;
  if ('email' in body) await sql`update account_profile set email = ${String(body.email).trim().slice(0, 180)}, updated_at = now() where id = 'main'`;
  if ('avatarUrl' in body) await sql`update account_profile set avatar_url = ${body.avatarUrl || null}, updated_at = now() where id = 'main'`;
  if ('role' in body && ['owner', 'editor', 'viewer'].includes(body.role)) await sql`update account_profile set role = ${body.role}, updated_at = now() where id = 'main'`;
  if (Array.isArray(body.permissions)) {
    const permissions = [...new Set(body.permissions.map(String).filter((value: string) => allowedPermissions.has(value)))];
    await sql`update account_profile set permissions = ${permissions}, updated_at = now() where id = 'main'`;
  }
  return NextResponse.json(await getAccount());
}
