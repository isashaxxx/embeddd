import { NextResponse } from 'next/server';
import { presignPut, publicUrl } from '@/lib/r2';
import { uid } from '@/lib/db';

/** Выдаёт две подписанные ссылки: под полный файл и под превью. */
export async function POST(req: Request) {
  const { ext = 'webp', contentType = 'image/webp', withThumb = true } = await req.json();
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
