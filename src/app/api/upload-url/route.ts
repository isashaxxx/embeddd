import { NextResponse } from 'next/server';
import { presignPut, publicUrl } from '@/lib/r2';
import { uid } from '@/lib/db';

const ALLOWED_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
};

/** Выдаёт две подписанные ссылки: под полный файл и под превью. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null) as { contentType?: unknown; withThumb?: unknown } | null;
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });

  const contentType = String(body.contentType || 'image/webp').toLowerCase();
  const ext = ALLOWED_TYPES[contentType];
  if (!ext) return NextResponse.json({ error: 'Unsupported file type' }, { status: 415 });

  const withThumb = body.withThumb !== false;
  const id = uid();
  const key = `full/${id}.${ext}`;
  const thumbKey = `thumb/${id}.webp`;

  return NextResponse.json({
    key,
    putUrl: await presignPut(key, contentType),
    src: publicUrl(key),
    thumbKey: withThumb ? thumbKey : null,
    thumbPutUrl: withThumb ? await presignPut(thumbKey, 'image/webp') : null,
    thumb: withThumb ? publicUrl(thumbKey) : null,
  });
}
