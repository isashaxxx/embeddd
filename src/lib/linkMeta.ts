import type { LinkItem } from '../types'
import { hostLabel, parseLink, PLATFORM_LABEL, type ParsedLink } from './platforms'

function fallbackTitle(p: ParsedLink, href: string) {
  if (p.handle) return `@${p.handle}`
  switch (p.platform) {
    case 'notion':
      return 'Notion page'
    case 'miro':
      return 'Miro board'
    case 'figma':
      return 'Figma file'
    case 'pinterest':
      return 'Pinterest pin'
    case 'instagram':
      return p.variant === 'video' ? 'Instagram reel' : 'Instagram post'
    case 'tiktok':
      return 'TikTok video'
    case 'youtube':
      return href.includes('/shorts/') ? 'YouTube Short' : 'YouTube video'
    default:
      return hostLabel(href)
  }
}

/** Platforms stuff their titles with boilerplate; strip it to what a person would write. */
export function cleanMeta(p: ParsedLink, item: Pick<LinkItem, 'title' | 'author' | 'metaDescription'>, href: string) {
  let title = item.title?.trim() ?? ''
  let author = item.author?.trim() ?? ''
  let subtitle = ''
  const desc = item.metaDescription?.trim() ?? ''

  if (p.variant === 'profile' && (p.platform === 'instagram' || p.platform === 'tiktok')) {
    title = title
      .replace(/\s*\(@[^)]*\).*$/, '')
      .replace(/\s+on TikTok$/i, '')
      .replace(/['’]s Creator Profile$/i, '')
    const followers = desc.match(/^(?:@\S+\s+)?([\d.,]+\s*[kmb]?)\s+followers/i)?.[1]
    subtitle = [p.handle && `@${p.handle}`, followers && `${followers} followers`].filter(Boolean).join(' · ')
  } else if (p.platform === 'instagram') {
    const m = title.match(/^(.*?) on Instagram:\s*["“]?([\s\S]*?)["”]?$/)
    if (m) {
      author = m[1]
      title = m[2]
    }
  } else if (p.platform === 'pinterest') {
    title = title.split(' | ')[0]
  }

  const label = PLATFORM_LABEL[p.platform]
  // "Material 3 Kit | Figma", "Templates | Notion Marketplace"
  title = title.replace(new RegExp(`\\s+[|–—-]\\s+[^|–—]*${label}[^|–—]*$`, 'i'), '')
  if (!title || title.toLowerCase() === label.toLowerCase()) title = fallbackTitle(p, href)

  if (!subtitle) subtitle = author || (p.handle ? `@${p.handle}` : hostLabel(href))
  return { title, subtitle, description: desc }
}

/** Everything a card or an export needs to present a link. */
export function describeLink(item: LinkItem) {
  const href = item.resolvedUrl ?? item.url
  const parsed = parseLink(href)
  return { href, parsed, ...cleanMeta(parsed, item, href) }
}
