import { siFigma, siInstagram, siMiro, siNotion, siPinterest, siTiktok, siYoutube, siYoutubeshorts } from 'simple-icons'
import { Globe } from 'lucide-react'
import type { Platform } from '../types'

const ICONS: Record<Exclude<Platform, 'web'>, { path: string }> = {
  notion: siNotion,
  miro: siMiro,
  figma: siFigma,
  pinterest: siPinterest,
  instagram: siInstagram,
  tiktok: siTiktok,
  youtube: siYoutube,
}

interface Props {
  platform: Platform
  shorts?: boolean
  size?: number
}

export function PlatformBadge({ platform, shorts, size = 36 }: Props) {
  const icon = platform === 'youtube' && shorts ? siYoutubeshorts : platform === 'web' ? null : ICONS[platform]
  return (
    <span className={`badge badge-${platform}`} style={{ width: size, height: size }}>
      {icon ? (
        <svg viewBox="0 0 24 24" width={size * 0.55} height={size * 0.55} aria-hidden>
          <path d={icon.path} fill="currentColor" />
        </svg>
      ) : (
        <Globe size={size * 0.5} strokeWidth={1.8} />
      )}
    </span>
  )
}
