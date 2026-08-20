import { redirect } from 'next/navigation';
import { db, uid } from '@/lib/db';
import { parseLink, unfurl } from '@/lib/parse';

export const dynamic = 'force-dynamic';

/**
 * Цель для share_target: «Поделиться → embeddd» из любого приложения.
 * Android отдаёт ссылку в url или в text, iOS-Shortcut — в text.
 */
export default async function Share({
  searchParams,
}: {
  searchParams: Promise<{ url?: string; text?: string; title?: string }>;
}) {
  const q = await searchParams;
  const raw = q.url || (q.text || '').match(/https?:\/\/\S+/)?.[0];
  if (!raw) redirect('/');

  const p = parseLink(raw);
  if (!p) redirect('/');

  let title = q.title || p.title || '';
  let thumb = p.thumb || null;
  if (p.kind === 'link') {
    const meta = await unfurl(p.url);
    title = title || meta.title || '';
    thumb = meta.thumb || null;
  }

  const sql = db();
  const [{ min }] = (await sql`select coalesce(min(position), 0) as min from items`) as { min: number }[];

  await sql`
    insert into items (id, kind, provider, position, url, host, embed_url, embed_h, ratio, src, thumb, title)
    values (${uid()}, ${p.kind}, ${p.provider}, ${Number(min) - 1}, ${p.url}, ${p.host},
            ${p.embedUrl ?? null}, ${p.embedH ?? null}, ${p.ratio ?? null}, ${p.src ?? null}, ${thumb}, ${title})`;

  redirect('/');
}
