export type Parsed = {
  kind: 'image' | 'video' | 'embed' | 'link';
  provider: string;
  url: string;
  host: string;
  embedUrl?: string;
  embedH?: number;
  ratio?: number;
  src?: string;
  thumb?: string;
  title?: string;
};

/** Определяет, чем является ссылка: эмбедом, картинкой, видео или закладкой. */
export function parseLink(raw: string): Parsed | null {
  let url = raw.trim();
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\./, '');
  const base = { url, host };

  // YouTube
  if (/^(youtube\.com|youtu\.be|m\.youtube\.com)$/.test(host)) {
    let id: string | null = null;
    if (host === 'youtu.be') id = u.pathname.slice(1);
    else if (u.searchParams.get('v')) id = u.searchParams.get('v');
    else {
      const m = u.pathname.match(/\/(embed|shorts|live|v)\/([\w-]+)/);
      if (m) id = m[2];
    }
    if (id)
      return {
        ...base,
        kind: 'embed',
        provider: 'youtube',
        embedUrl: `https://www.youtube.com/embed/${id}?autoplay=1&rel=0`,
        thumb: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
        ratio: 56.25,
        title: 'YouTube',
      };
  }

  // Vimeo
  if (host === 'vimeo.com') {
    const id = u.pathname.match(/\/(\d+)/)?.[1];
    if (id)
      return { ...base, kind: 'embed', provider: 'vimeo', embedUrl: `https://player.vimeo.com/video/${id}`, ratio: 56.25 };
  }

  // Pinterest
  if (/pinterest\.[a-z.]+$/.test(host) || host === 'pin.it') {
    const id = u.pathname.match(/\/pin\/(\d+)/)?.[1];
    if (id)
      return {
        ...base,
        kind: 'embed',
        provider: 'pinterest',
        embedUrl: `https://assets.pinterest.com/ext/embed.html?id=${id}`,
        embedH: 560,
      };
    return { ...base, kind: 'link', provider: 'pinterest' };
  }

  // Instagram
  if (/instagram\.com$/.test(host)) {
    const m = u.pathname.match(/\/(p|reel|tv)\/([\w-]+)/);
    if (m)
      return {
        ...base,
        kind: 'embed',
        provider: 'instagram',
        embedUrl: `https://www.instagram.com/${m[1]}/${m[2]}/embed/captioned/`,
        embedH: 620,
      };
  }

  // TikTok
  if (/tiktok\.com$/.test(host)) {
    const id = u.pathname.match(/\/video\/(\d+)/)?.[1];
    if (id)
      return { ...base, kind: 'embed', provider: 'tiktok', embedUrl: `https://www.tiktok.com/embed/v2/${id}`, embedH: 620 };
  }

  // X / Twitter
  if (/^(twitter\.com|x\.com)$/.test(host)) {
    const id = u.pathname.match(/status\/(\d+)/)?.[1];
    if (id)
      return {
        ...base,
        kind: 'embed',
        provider: 'x',
        embedUrl: `https://platform.twitter.com/embed/Tweet.html?id=${id}&theme=light`,
        embedH: 420,
      };
  }

  // Figma
  if (/figma\.com$/.test(host))
    return {
      ...base,
      kind: 'embed',
      provider: 'figma',
      embedUrl: `https://www.figma.com/embed?embed_host=embeddd&url=${encodeURIComponent(url)}`,
      embedH: 420,
    };

  // Spotify
  if (/spotify\.com$/.test(host))
    return {
      ...base,
      kind: 'embed',
      provider: 'spotify',
      embedUrl: `https://open.spotify.com/embed${u.pathname}`,
      embedH: 180,
    };

  // Прямые файлы
  if (/\.(jpe?g|png|gif|webp|avif|bmp|svg)(\?|$)/i.test(u.pathname))
    return { ...base, kind: 'image', provider: host, src: url, thumb: url };
  if (/\.(mp4|webm|mov|m4v)(\?|$)/i.test(u.pathname))
    return { ...base, kind: 'video', provider: host, src: url };

  return { ...base, kind: 'link', provider: host, title: host };
}

/** Тянет og:image и og:title со страницы. Тихо сдаётся, если не вышло. */
export async function unfurl(url: string): Promise<{ title?: string; thumb?: string }> {
  try {
    const res = await fetch(url, {
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; embedddbot/1.0)',
        accept: 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return {};
    const html = (await res.text()).slice(0, 300_000);

    const meta = (prop: string) => {
      const re = new RegExp(
        `<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']|` +
          `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["']`,
        'i'
      );
      const m = html.match(re);
      return m ? decodeEntities(m[1] || m[2]) : undefined;
    };

    const title = meta('og:title') || meta('twitter:title') || decodeEntities(html.match(/<title[^>]*>([^<]+)</i)?.[1] || '');
    let thumb = meta('og:image') || meta('twitter:image');
    if (thumb && thumb.startsWith('/')) thumb = new URL(thumb, url).toString();

    return { title: title || undefined, thumb: thumb || undefined };
  } catch {
    return {};
  }
}

function decodeEntities(s: string) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim();
}
