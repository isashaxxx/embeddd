import type { ServerResponse } from 'node:http'
import type { Connect } from 'vite'

// Server-side link preview: fetching OpenGraph / oEmbed from the browser is
// blocked by CORS, so the dev (and preview) server does it for the client.

export interface UnfurlResult {
  url: string
  title?: string
  description?: string
  image?: string
  author?: string
}

const CRAWLER_UA = 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)'
const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36'

const cache = new Map<string, UnfurlResult>()

function isPublicHttpUrl(raw: string): URL | null {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return null
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
  const h = u.hostname
  if (
    h === 'localhost' ||
    h.endsWith('.local') ||
    /^(127|10|0)\./.test(h) ||
    /^192\.168\./.test(h) ||
    /^169\.254\./.test(h) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(h) ||
    h.startsWith('[')
  ) {
    return null
  }
  return u
}

function decodeEntities(s: string) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&quot;/g, '"')
    .replace(/&(#39|apos);/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim()
}

type PageMeta = Pick<UnfurlResult, 'title' | 'description' | 'image'>

function parseMeta(html: string): PageMeta {
  const meta: Record<string, string> = {}
  for (const tag of html.match(/<meta\s[^>]*>/gi) ?? []) {
    const attrs: Record<string, string> = {}
    for (const m of tag.matchAll(/([a-zA-Z:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
      attrs[m[1].toLowerCase()] = m[2] ?? m[3] ?? ''
    }
    const key = (attrs.property || attrs.name || '').toLowerCase()
    if (key && attrs.content && !(key in meta)) meta[key] = decodeEntities(attrs.content)
  }
  const title = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]
  return {
    title: meta['og:title'] || meta['twitter:title'] || (title ? decodeEntities(title) : undefined),
    description: meta['og:description'] || meta['twitter:description'] || meta['description'],
    image: meta['og:image'] || meta['twitter:image'] || meta['twitter:image:src'],
  }
}

async function fetchPage(url: string, ua: string) {
  const res = await fetch(url, {
    headers: { 'user-agent': ua, 'accept-language': 'en-US,en;q=0.9', accept: 'text/html,*/*' },
    redirect: 'follow',
    signal: AbortSignal.timeout(9000),
  })
  const type = res.headers.get('content-type') ?? ''
  // Error pages (e.g. CDN bot blocks) have titles too; don't mistake them for content.
  const html = res.ok && type.includes('html') ? (await res.text()).slice(0, 2_000_000) : ''
  return { finalUrl: res.url || url, html }
}

function oembedEndpoint(u: URL): string | null {
  const host = u.hostname.replace(/^(www|m)\./, '')
  const q = encodeURIComponent(u.toString())
  if (host === 'youtube.com' || host === 'youtu.be') return `https://www.youtube.com/oembed?format=json&url=${q}`
  if (host.endsWith('tiktok.com')) return `https://www.tiktok.com/oembed?url=${q}`
  if (host.includes('pinterest.')) return `https://www.pinterest.com/oembed.json?url=${q}`
  if (host.endsWith('figma.com')) return `https://www.figma.com/api/oembed?url=${q}`
  return null
}

function youtubeId(u: URL): string | null {
  const host = u.hostname.replace(/^(www|m)\./, '')
  if (host === 'youtu.be') return u.pathname.slice(1) || null
  const parts = u.pathname.split('/').filter(Boolean)
  if (parts[0] === 'shorts' || parts[0] === 'embed') return parts[1] ?? null
  return u.searchParams.get('v')
}

async function exists(url: string) {
  try {
    const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(5000) })
    return res.ok
  } catch {
    return false
  }
}

async function unfurl(raw: string): Promise<UnfurlResult> {
  const cached = cache.get(raw)
  if (cached) return cached

  let finalUrl = raw
  let og: PageMeta = {}

  try {
    const page = await fetchPage(raw, CRAWLER_UA)
    finalUrl = page.finalUrl
    og = parseMeta(page.html)
    if (!og.title && !og.image) {
      const retry = await fetchPage(finalUrl, BROWSER_UA)
      const og2 = parseMeta(retry.html)
      if (og2.title || og2.image) og = og2
    }
  } catch {
    // keep going: oEmbed may still work
  }

  const result: UnfurlResult = { url: finalUrl, ...og }
  const target = isPublicHttpUrl(finalUrl)

  const endpoint = target && oembedEndpoint(target)
  if (endpoint) {
    try {
      const res = await fetch(endpoint, { signal: AbortSignal.timeout(8000) })
      if (res.ok) {
        const data = (await res.json()) as Record<string, string>
        result.title = data.title || result.title
        result.author = data.author_name || result.author
        result.image = data.thumbnail_url || result.image
      }
    } catch {
      // oEmbed is optional
    }
  }

  // Shorts have a vertical "original aspect ratio" thumbnail.
  const ytId = target && youtubeId(target)
  if (target && ytId && target.pathname.startsWith('/shorts/')) {
    const vertical = `https://i.ytimg.com/vi/${ytId}/oar2.jpg`
    if (await exists(vertical)) result.image = vertical
  }

  if (result.image) {
    try {
      result.image = new URL(result.image, finalUrl).toString()
    } catch {
      result.image = undefined
    }
  }

  cache.set(raw, result)
  return result
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json')
  res.end(JSON.stringify(body))
}

/** `/api/unfurl` and `/api/img`. Connect-style, so it runs in Vite and as a Vercel Function. */
export const unfurlHandler: Connect.NextHandleFunction = async (req, res, next) => {
  const reqUrl = new URL(req.url ?? '/', 'http://local')
  if (reqUrl.pathname !== '/api/unfurl' && reqUrl.pathname !== '/api/img') return next()

  const target = isPublicHttpUrl(reqUrl.searchParams.get('url') ?? '')
  if (!target) return sendJson(res, 400, { error: 'invalid url' })

  try {
    if (reqUrl.pathname === '/api/unfurl') {
      res.setHeader('cache-control', 'public, max-age=3600, s-maxage=86400')
      return sendJson(res, 200, await unfurl(target.toString()))
    }

    // Image proxy: CDN thumbnails (Instagram, TikTok) block hotlinking and
    // their signed URLs expire, so the client downloads them once via here.
    const upstream = await fetch(target, {
      headers: { 'user-agent': BROWSER_UA },
      signal: AbortSignal.timeout(10000),
    })
    const type = upstream.headers.get('content-type') ?? ''
    if (!upstream.ok || !type.startsWith('image/')) return sendJson(res, 502, { error: 'not an image' })
    res.statusCode = 200
    res.setHeader('content-type', type)
    res.setHeader('cache-control', 'public, max-age=86400')
    res.end(Buffer.from(await upstream.arrayBuffer()))
  } catch (err) {
    sendJson(res, 502, { error: String(err) })
  }
}
