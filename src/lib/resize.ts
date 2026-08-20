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

/** Извлекает лёгкую WebP-обложку из первого доступного кадра видео. */
export async function videoPreview(file: File, max = 700) {
  return new Promise<{ blob: Blob; width: number; height: number }>((resolve, reject) => {
    const video = document.createElement('video');
    const objectUrl = URL.createObjectURL(file);
    const cleanup = () => { URL.revokeObjectURL(objectUrl); video.removeAttribute('src'); video.load(); };
    const timeout = window.setTimeout(() => { cleanup(); reject(new Error('Не удалось создать обложку')); }, 12000);
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.onloadedmetadata = () => { video.currentTime = Math.min(0.15, Math.max(0, video.duration / 2)); };
    video.onseeked = () => {
      const scale = Math.min(1, max / Math.max(video.videoWidth, video.videoHeight));
      const width = Math.max(1, Math.round(video.videoWidth * scale));
      const height = Math.max(1, Math.round(video.videoHeight * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      canvas.getContext('2d')?.drawImage(video, 0, 0, width, height);
      canvas.toBlob((blob) => {
        window.clearTimeout(timeout); cleanup();
        if (blob) resolve({ blob, width: video.videoWidth || width, height: video.videoHeight || height });
        else reject(new Error('Не удалось создать обложку'));
      }, 'image/webp', .78);
    };
    video.onerror = () => { window.clearTimeout(timeout); cleanup(); reject(new Error('Видео не читается')); };
    video.src = objectUrl;
  });
}
