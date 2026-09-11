import type { LinkVariant, Platform, Size } from '../types'

export interface ParsedLink {
  platform: Platform
  variant: LinkVariant
  embedUrl?: string
  handle?: string
}

export const PLATFORM_LABEL: Record<Platform, string> = {
  notion: 'Notion',
  miro: 'Miro',
  figma: 'Figma',
  pinterest: 'Pinterest',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  web: 'Link',
}

/** Accepts "figma.com/..." without a scheme; returns null for non-URLs. */
export function normalizeUrl(input: string): string | null {
  const s = input.trim()
  if (!s || /\s/.test(s)) return null
  const withScheme = /^https?:\/\//i.test(s) ? s : /^[\w-]+(\.[\w-]+)+(\/|$)/.test(s) ? `https://${s}` : null
  if (!withScheme) return null
  try {
    return new URL(withScheme).toString()
  } catch {
    return null
  }
}

export function parseLink(raw: string): ParsedLink {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return { platform: 'web', variant: 'page' }
  }
  const host = u.hostname.replace(/^(www|m)\./, '')
  const parts = u.pathname.split('/').filter(Boolean)

  if (host.endsWith('notion.so') || host.endsWith('notion.site') || host === 'notion.com') {
    return { platform: 'notion', variant: 'doc' }
  }

  if (host.endsWith('miro.com')) {
    const id = parts[parts.indexOf('board') + 1]
    return {
      platform: 'miro',
      variant: 'doc',
      embedUrl: parts.includes('board') && id ? `https://miro.com/app/live-embed/${id}/?embedMode=view_only_without_ui` : undefined,
    }
  }

  if (host.endsWith('figma.com')) {
    return {
      platform: 'figma',
      variant: 'doc',
      embedUrl: `https://www.figma.com/embed?embed_host=embeddd&url=${encodeURIComponent(raw)}`,
    }
  }

  if (host === 'pin.it' || /(^|\.)pinterest\./.test(host)) {
    const id = parts[0] === 'pin' ? parts[1]?.match(/^\d+/)?.[0] : undefined
    return {
      platform: 'pinterest',
      variant: 'post',
      embedUrl: id ? `https://assets.pinterest.com/ext/embed.html?id=${id}` : undefined,
    }
  }

  if (host.endsWith('instagram.com')) {
    // /p/CODE, /reel/CODE, and the /username/p/CODE form
    const i = parts.findIndex((p) => ['p', 'reel', 'reels', 'tv'].includes(p))
    const code = i >= 0 ? parts[i + 1] : undefined
    if (code) {
      const isVideo = parts[i] !== 'p'
      return {
        platform: 'instagram',
        variant: isVideo ? 'video' : 'post',
        embedUrl: `https://www.instagram.com/${isVideo ? 'reel' : 'p'}/${code}/embed/`,
      }
    }
    if (parts[0]) return { platform: 'instagram', variant: 'profile', handle: parts[0] }
    return { platform: 'instagram', variant: 'page' }
  }

  if (host.endsWith('tiktok.com')) {
    const vi = parts.indexOf('video')
    const id = vi >= 0 ? parts[vi + 1] : undefined
    if (id) {
      return {
        platform: 'tiktok',
        variant: 'video',
        embedUrl: `https://www.tiktok.com/player/v1/${id}?autoplay=1&loop=1&rel=0`,
      }
    }
    const handle = parts.find((p) => p.startsWith('@'))
    if (handle) return { platform: 'tiktok', variant: 'profile', handle: handle.slice(1) }
    // vm.tiktok.com short link: variant is known only after it resolves
    return { platform: 'tiktok', variant: 'video' }
  }

  if (host === 'youtube.com' || host === 'youtu.be') {
    const id =
      host === 'youtu.be'
        ? parts[0]
        : parts[0] === 'shorts' || parts[0] === 'embed'
          ? parts[1]
          : u.searchParams.get('v') ?? undefined
    if (id) {
      return {
        platform: 'youtube',
        variant: 'video',
        embedUrl: `https://www.youtube.com/embed/${id}?autoplay=1&playsinline=1&loop=1&playlist=${id}&rel=0`,
      }
    }
    return { platform: 'youtube', variant: 'profile', handle: parts[0]?.replace(/^@/, '') }
  }

  return { platform: 'web', variant: 'page' }
}

export function defaultLinkSize({ platform, variant }: ParsedLink): Size {
  if (variant === 'video' || variant === 'post') return 'M'
  if (platform === 'figma' || platform === 'miro') return 'L'
  return 'S'
}

/** Portrait media gets a tall card, landscape a big one. */
export function sizeForAspect(aspect: number): Size {
  if (aspect < 0.8) return 'M'
  if (aspect > 1.25) return 'L'
  return 'S'
}

export function hostLabel(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}
