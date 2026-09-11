import { useMemo, useState } from 'react'
import { ArrowUpRight, Play, X } from 'lucide-react'
import { useBlobUrl } from '../../hooks/useBlobUrl'
import { useBoardEnv } from '../../lib/boardEnv'
import { cleanMeta } from '../../lib/linkMeta'
import { parseLink } from '../../lib/platforms'
import type { LinkItem } from '../../types'
import { PlatformBadge } from '../PlatformBadge'

function ArrowLink({ href, light }: { href: string; light?: boolean }) {
  return (
    <a
      className={`arrow${light ? ' light' : ''}`}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      draggable={false}
      onClick={(e) => e.stopPropagation()}
      aria-label="Open link"
    >
      <ArrowUpRight size={20} strokeWidth={1.8} />
    </a>
  )
}

function Embed({ src, title, onClose }: { src: string; title: string; onClose?: () => void }) {
  return (
    <div className="embed">
      <iframe
        src={src}
        title={title}
        loading="lazy"
        allow="autoplay; encrypted-media; fullscreen; picture-in-picture; clipboard-write"
        allowFullScreen
      />
      {onClose && (
        <button
          className="chip chip-dark corner"
          onClick={(e) => {
            e.stopPropagation()
            onClose()
          }}
          aria-label="Close preview"
        >
          <X size={16} />
        </button>
      )}
    </div>
  )
}

export function LinkCard({ item }: { item: LinkItem }) {
  const href = item.resolvedUrl ?? item.url
  const { allowEmbeds = true } = useBoardEnv()
  const detected = useMemo(() => parseLink(href), [href])
  const parsed = allowEmbeds ? detected : { ...detected, embedUrl: undefined }
  const thumb = useBlobUrl(item.thumbId)
  const [live, setLive] = useState(false)
  const meta = cleanMeta(parsed, item, href)
  const shorts = href.includes('/shorts/')

  if (item.status === 'loading') {
    return (
      <div className="link-doc">
        <div className="card-head">
          <PlatformBadge platform={parsed.platform} shorts={shorts} />
        </div>
        <div className="card-foot">
          <div className="skeleton line" style={{ width: '70%' }} />
          <div className="skeleton line" style={{ width: '40%' }} />
        </div>
      </div>
    )
  }

  if (live && parsed.embedUrl) return <Embed src={parsed.embedUrl} title={meta.title} onClose={() => setLive(false)} />

  const visual = parsed.variant === 'video' || parsed.variant === 'post'

  // Instagram hides previews from crawlers; its own embed is the best fallback.
  if (visual && !thumb && parsed.embedUrl && item.size !== 'S') {
    return <Embed src={parsed.embedUrl} title={meta.title} />
  }

  if (visual && thumb) {
    const playable = parsed.variant === 'video' && parsed.embedUrl
    return (
      <div className="link-visual">
        <img className="cover" src={thumb} alt="" draggable={false} />
        <div className="shade" />
        <div className="card-head">
          <PlatformBadge platform={parsed.platform} shorts={shorts} />
          <ArrowLink href={href} light />
        </div>
        {playable && (
          <button
            className="play"
            onClick={(e) => {
              // Play in place; clicking elsewhere on the card opens its details.
              e.stopPropagation()
              setLive(true)
            }}
            aria-label="Play"
          >
            <Play size={22} fill="currentColor" />
          </button>
        )}
        {item.size !== 'S' && (
          <div className="card-foot light">
            {/* The title lives in the caption below the card once there is one. */}
            {!item.caption && <div className="title clamp-2">{meta.title}</div>}
            <div className="sub">{meta.subtitle}</div>
          </div>
        )}
      </div>
    )
  }

  if (parsed.variant === 'profile') {
    return (
      <div className="link-doc">
        <div className="card-head">
          <PlatformBadge platform={parsed.platform} shorts={shorts} />
          <ArrowLink href={href} />
        </div>
        <div className="card-foot">
          {thumb && <img className="avatar" src={thumb} alt="" draggable={false} />}
          <div className="title clamp-2">{meta.title}</div>
          <div className="sub">{meta.subtitle}</div>
        </div>
      </div>
    )
  }

  const showPreview = item.size !== 'S' && (thumb || parsed.embedUrl)
  return (
    <div className="link-doc">
      <div className="card-head">
        <PlatformBadge platform={parsed.platform} shorts={shorts} />
        <ArrowLink href={href} />
      </div>
      <div className={showPreview ? 'doc-text' : 'card-foot'}>
        <div className="title clamp-2">{meta.title}</div>
        <div className="sub clamp-1">{meta.subtitle}</div>
      </div>
      {showPreview && (
        <div className="preview">
          {thumb ? (
            <img src={thumb} alt="" draggable={false} />
          ) : (
            <div className="preview-empty">
              <PlatformBadge platform={parsed.platform} size={56} />
            </div>
          )}
          {parsed.embedUrl && (
            <button
              className="chip chip-light preview-btn"
              onClick={(e) => {
                e.stopPropagation()
                setLive(true)
              }}
            >
              <Play size={13} fill="currentColor" /> Live preview
            </button>
          )}
        </div>
      )}
    </div>
  )
}
