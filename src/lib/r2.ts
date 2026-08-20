import { S3Client, DeleteObjectsCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export const r2 = () =>
  new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });

/** Ссылка, по которой браузер льёт файл напрямую в бакет, минуя Vercel. */
export async function presignPut(key: string, contentType: string) {
  return getSignedUrl(
    r2(),
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET!,
      Key: key,
      ContentType: contentType,
      CacheControl: 'public, max-age=31536000, immutable',
    }),
    { expiresIn: 600 }
  );
}

export const publicUrl = (key: string) => `${process.env.R2_PUBLIC_URL}/${key}`;

export async function deleteKeys(keys: string[]) {
  const list = keys.filter(Boolean);
  if (!list.length) return;
  await r2().send(
    new DeleteObjectsCommand({
      Bucket: process.env.R2_BUCKET!,
      Delete: { Objects: list.map((Key) => ({ Key })) },
    })
  );
}
