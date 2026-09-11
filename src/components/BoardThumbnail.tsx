import { useEffect, useState } from 'react'
import { CalendarDays, Clock, CloudSun, Paperclip, Play } from 'lucide-react'
import { useBlobUrl } from '../hooks/useBlobUrl'
import { loadItems } from '../lib/storage'
import { parseLink } from '../lib/platforms'
import type { BoardMeta, Item } from '../types'
import { PlatformBadge } from './PlatformBadge'
import { SketchPreview } from './sketch/Sketch'

const MAX_ITEMS = 14

function ThumbCell({ item }: { item: Item }) {
  const blobId = item.kind === 'image' || item.kind === 'video' ? item.blobId : item.kind === 'link' ? item.thumbId : undefined
  const url = useBlobUrl(blobId)

  let content = null
  if (item.kind === 'image' && url) content = <img src={url} alt="" draggable={false} />
  else if (item.kind === 'video' && url) content = <video src={`${url}#t=0.1`} muted preload="metadata" />
  else if (item.kind === 'link' && url) content = <img src={url} alt="" draggable={false} />
  else if (item.kind === 'link') {
    content = (
      <span className="thumb-badge">
        <PlatformBadge platform={parseLink(item.resolvedUrl ?? item.url).platform} size={18} />
      </span>
    )
  } else if (item.kind === 'file') {
    content = <Paperclip className="thumb-file" size={12} />
  } else if (item.kind === 'widget') {
    const Icon = item.widget === 'clock' ? Clock : item.widget === 'weather' ? CloudSun : CalendarDays
    content = <Icon className="thumb-widget" size={12} />
  } else if (item.kind === 'sketch') {
    content = <SketchPreview strokes={item.strokes} />
  } else if (item.kind === 'text') {
    const emoji = item.blocks.find((b) => b.type === 'emoji')?.icon
    content = emoji ? (
      <span className="thumb-emoji">{emoji}</span>
    ) : (
      <span className="thumb-lines">
        <i />
        <i />
        <i />
      </span>
    )
  }

  const playable = item.kind === 'video' || (item.kind === 'link' && url && parseLink(item.url).variant === 'video')
  return (
    <div className={`thumb-cell size-${item.size} kind-${item.kind}${item.kind === 'widget' ? ` widget-${item.widget}` : ''}`}>
      {content}
      {playable && (
        <span className="thumb-play">
          <Play size={8} fill="currentColor" />
        </span>
      )}
    </div>
  )
}

interface Props {
  board: BoardMeta
  /** Shared snapshots pass items directly instead of reading local storage. */
  items?: Item[]
}

/** A miniature of the board's real layout, the way Figma shows a file's canvas. */
export function BoardThumbnail({ board, items: provided }: Props) {
  const [loaded, setLoaded] = useState<Item[] | null>(null)

  useEffect(() => {
    if (provided) return
    let alive = true
    loadItems(board.id).then((list) => alive && setLoaded(list))
    return () => {
      alive = false
    }
  }, [board.id, board.updatedAt, provided])

  const items = (provided ?? loaded)?.slice(0, MAX_ITEMS)

  return (
    <div className="thumb" data-cols={board.columns ?? 4}>
      {items && items.length > 0 && (
        <div className="thumb-grid">
          {items.map((item) => (
            <ThumbCell key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  )
}
