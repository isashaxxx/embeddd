import { createHmac } from 'node:crypto';

function signedUrl(method: 'PUT' | 'DELETE', key: string) {
  const expires = Math.floor(Date.now() / 1000) + 600;
  const sig = createHmac('sha256', process.env.MEDIA_SIGNING_SECRET!)
    .update(`${method}\n${key}\n${expires}`)
    .digest('hex');
  return `${publicUrl(key)}?expires=${expires}&sig=${sig}`;
}

/** Ссылка, по которой браузер льёт файл напрямую в бакет, минуя Vercel. */
export async function presignPut(key: string, contentType: string) {
  void contentType;
  return signedUrl('PUT', key);
}

export const publicUrl = (key: string) => `${process.env.R2_PUBLIC_URL}/${key}`;

export async function deleteKeys(keys: string[]) {
  const list = keys.filter(Boolean);
  if (!list.length) return;
  await Promise.all(list.map((key) => fetch(signedUrl('DELETE', key), { method: 'DELETE' })));
}
