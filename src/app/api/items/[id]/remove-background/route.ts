import { NextResponse } from 'next/server';
import { db, uid } from '@/lib/db';
import { deleteKeys, presignPut, publicUrl } from '@/lib/r2';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!process.env.OPENAI_API_KEY) return NextResponse.json({ error: 'OPENAI_API_KEY не настроен' }, { status: 503 });
  const sql = db();
  const rows = (await sql`select * from items where id = ${id}`) as Record<string, unknown>[];
  const item = rows[0];
  const source = String(item?.src || item?.thumb || '');
  if (!item || item.kind !== 'image' || !source) return NextResponse.json({ error: 'Изображение не найдено' }, { status: 404 });

  const sourceResponse = await fetch(source);
  if (!sourceResponse.ok) return NextResponse.json({ error: 'Не удалось скачать исходник' }, { status: 502 });
  const sourceBlob = await sourceResponse.blob();
  const form = new FormData();
  form.append('model', process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1.5');
  form.append('image', sourceBlob, 'source.png');
  form.append('prompt', 'Remove the entire background. Keep the main subject and all of its details unchanged. Return a clean cutout with a fully transparent background and crisp natural edges.');
  form.append('background', 'transparent');
  form.append('output_format', 'webp');
  form.append('quality', 'medium');

  const aiResponse = await fetch('https://api.openai.com/v1/images/edits', { method: 'POST', headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, body: form });
  const aiData = await aiResponse.json();
  if (!aiResponse.ok) return NextResponse.json({ error: aiData?.error?.message || 'ИИ не смог удалить фон' }, { status: aiResponse.status });
  const encoded = aiData?.data?.[0]?.b64_json;
  if (!encoded) return NextResponse.json({ error: 'ИИ вернул пустое изображение' }, { status: 502 });

  const bytes = Buffer.from(encoded, 'base64');
  const key = `full/${uid()}.webp`;
  const upload = await fetch(await presignPut(key, 'image/webp'), { method: 'PUT', headers: { 'content-type': 'image/webp' }, body: bytes });
  if (!upload.ok) return NextResponse.json({ error: 'Не удалось сохранить результат' }, { status: 502 });
  const imageUrl = publicUrl(key);
  const oldKeys = [item.r2_key, item.r2_thumb_key].filter(Boolean) as string[];
  await sql`update items set src = ${imageUrl}, thumb = ${imageUrl}, r2_key = ${key}, r2_thumb_key = null where id = ${id}`;
  if (oldKeys.length) await deleteKeys(oldKeys).catch(() => {});
  const updated = (await sql`select * from items where id = ${id}`) as unknown[];
  return NextResponse.json(updated[0]);
}
