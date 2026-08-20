/**
 * Жмёт картинку в браузере до загрузки. 8 МБ с айфона превращаются в ~300 КБ,
 * и бесплатных 10 ГБ в R2 хватает надолго.
 */
export async function shrink(file: File, max: number, quality = 0.82) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  const blob: Blob = await new Promise((res) =>
    canvas.toBlob((b) => res(b!), 'image/webp', quality)
  );
  return { blob, width: w, height: h };
}

export async function videoSize(file: File) {
  return new Promise<{ width: number; height: number }>((res) => {
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.onloadedmetadata = () => {
      res({ width: v.videoWidth, height: v.videoHeight });
      URL.revokeObjectURL(v.src);
    };
    v.onerror = () => res({ width: 0, height: 0 });
    v.src = URL.createObjectURL(file);
  });
}
