import { isIP } from 'node:net';

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

function isPrivateHostname(hostname: string) {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return true;
  if (host === '0.0.0.0' || host === '::' || host === '::1') return true;
  if (isIP(host) === 4) {
    const [a, b] = host.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }
  if (isIP(host) === 6) {
    return host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe8') || host.startsWith('fe9') || host.startsWith('fea') || host.startsWith('feb');
  }
  return false;
}

function safeHttpUrl(raw: string) {
  try {
    const url = new URL(raw);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    if (url.username || url.password || isPrivateHostname(url.hostname)) return null;
    return url;
  } catch {
    return null;
  }
}

/** Определяет, чем является ссылка: эмбедом, картинкой, видео или закладкой. */
export function parseLink(raw: string): Parsed | null {
  let url = raw.trim();
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
  const u = safeHttpUrl(url);
  if (!u) return null;

  url = u.toString();
  const host = u.hostname.replace(/^www\./, '');
  const base = { url, host };

  if (/^(youtube\.com|youtu\.be|m\.youtube\.com)$/.test(host)) {
    let id: string | null = null;
    if (host === 'youtu.be') id = u.pathname.slice(1);
    else if (u.searchParams.get('v')) id = u.searchParams.get('v');
    else {
      const m = u.pathname.match(/\/(embed|shorts|live|v)\/([\w-]+)/);
      if (m) id = m[2];
    }
    if (id) return { ...base, kind: 'embed', provider: 'youtube', embedUrl: `https://www.youtube.com/embed/${id}?autoplay=1&rel=0`, thumb: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`, ratio: 56.25, title: 'YouTube' };
  }
  if (host === 'vimeo.com') {
    const id = u.pathname.match(/\/(\d+)/)?.[1];
    if (id) return { ...base, kind: 'embed', provider: 'vimeo', embedUrl: `https://player.vimeo.com/video/${id}`, ratio: 56.25 };
  }
  if (/pinterest\.[a-z.]+$/.test(host) || host === 'pin.it') {
    const id = u.pathname.match(/\/pin\/(\d+)/)?.[1];
    if (id) return { ...base, kind: 'embed', provider: 'pinterest', embedUrl: `https://assets.pinterest.com/ext/embed.html?id=${id}`, embedH: 560 };
    return { ...base, kind: 'link', provider: 'pinterest' };
  }
  if (/instagram\.com$/.test(host)) {
    const m = u.pathname.match(/\/(p|reel|tv)\/([\w-]+)/);
    if (m) return { ...base, kind: 'embed', provider: 'instagram', embedUrl: `https://www.instagram.com/${m[1]}/${m[2]}/embed/captioned/`, embedH: 620 };
  }
  if (/tiktok\.com$/.test(host)) {
    const id = u.pathname.match(/\/video\/(\d+)/)?.[1];
    if (id) return { ...base, kind: 'embed', provider: 'tiktok', embedUrl: `https://www.tiktok.com/embed/v2/${id}`, embedH: 620 };
  }
  if (/^(twitter\.com|x\.com)$/.test(host)) {
    const id = u.pathname.match(/status\/(\d+)/)?.[1];
    if (id) return { ...base, kind: 'embed', provider: 'x', embedUrl: `https://platform.twitter.com/embed/Tweet.html?id=${id}&theme=light`, embedH: 420 };
  }
  if (/figma\.com$/.test(host)) return { ...base, kind: 'embed', provider: 'figma', embedUrl: `https://www.figma.com/embed?embed_host=embeddd&url=${encodeURIComponent(url)}`, embedH: 420 };
  if (/spotify\.com$/.test(host)) return { ...base, kind: 'embed', provider: 'spotify', embedUrl: `https://open.spotify.com/embed${u.pathname}`, embedH: 180 };
  if (/\.(jpe?g|png|gif|webp|avif|bmp|svg)$/i.test(u.pathname)) return { ...base, kind: 'image', provider: host, src: url, thumb: url };
  if (/\.(mp4|webm|mov|m4v)$/i.test(u.pathname)) return { ...base, kind: 'video', provider: host, src: url };
  return { ...base, kind: 'link', provider: host, title: host };
}

/** Тянет og:image и og:title со страницы. Редиректы проверяются вручную. */
export async function unfurl(rawUrl: string): Promise<{ title?: string; thumb?: string }> {
  try {
    let current = safeHttpUrl(rawUrl);
    if (!current) return {};
    let res: Response | null = null;

    for (let i = 0; i < 4; i++) {
      res = await fetch(current, {
        redirect: 'manual',
        headers: {
          'user-agent': 'Mozilla/5.0 (compatible; embedddbot/1.0)',
          accept: 'text/html,application/xhtml+xml',
        },
        signal: AbortSignal.timeout(6000),
      });
      if ([301, 302, 303, 307, 308].includes(res.status)) {
        const location = res.headers.get('location');
        if (!location) return {};
        current = safeHttpUrl(new URL(location, current).toString());
        if (!current) return {};
        continue;
      }
      break;
    }

    if (!res?.ok) return {};
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) return {};
    const html = (await res.text()).slice(0, 300_000);

    const meta = (prop: string) => {
      const re = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']|<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["']`, 'i');
      const m = html.match(re);
      return m ? decodeEntities(m[1] || m[2]) : undefined;
    };

    const title = meta('og:title') || meta('twitter:title') || decodeEntities(html.match(/<title[^>]*>([^<]+)</i)?.[1] || '');
    let thumb = meta('og:image') || meta('twitter:image');
    if (thumb) {
      const candidate = safeHttpUrl(new URL(thumb, current).toString());
      thumb = candidate?.toString();
    }
    return { title: title?.slice(0, 500) || undefined, thumb: thumb || undefined };
  } catch {
    return {};
  }
}

function decodeEntities(s: string) {
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&nbsp;/g, ' ').trim();
}
