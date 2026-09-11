import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowUpRight, ChevronLeft, ChevronRight, Download, PenLine, Trash2, X } from 'lucide-react'
import { useBlobUrl } from '../hooks/useBlobUrl'
import { docTitle } from '../lib/blocks'
import { useBoardEnv } from '../lib/boardEnv'
import { formatBytes } from '../lib/format'
import { describeLink } from '../lib/linkMeta'
import { hostLabel, PLATFORM_LABEL } from '../lib/platforms'
import type { Item } from '../types'
import { DocEditor } from './DocEditor'
import { PlatformBadge } from './PlatformBadge'
import { SketchPreview } from './sketch/Sketch'
import { TagInput } from './TagInput'
import { WidgetCard } from './widgets/Widgets'

const KIND_LABEL: Record<Item['kind'], string> = {
  text: 'Text',
  image: 'Photo',
  video: 'Video',
  file: 'File',
  link: 'Link',
  widget: 'Widget',
  sketch: 'Sketch',
}

function Preview({ item, onUpdate, onDraw }: { item: Item; onUpdate: (patch: Partial<Item>) => void; onDraw: () => void }) {
  const { readOnly, allowEmbeds = true } = useBoardEnv()
  const blobId = item.kind === 'image' || item.kind === 'video' || item.kind === 'file' ? item.blobId : item.kind === 'link' ? item.thumbId : undefined
  const url = useBlobUrl(blobId)

  switch (item.kind) {
    case 'image':
      return url ? <img className="detail-media" src={url} alt={item.caption ?? ''} /> : null
    case 'video':
      return url ? <video className="detail-media" src={url} controls autoPlay playsInline /> : null
    case 'text':
      return (
        <div className="detail-doc">
          <DocEditor blocks={item.blocks} onChange={(blocks) => onUpdate({ blocks })} className="doc-large" />
        </div>
      )
    case 'widget':
      return (
        <div className={`detail-widget widget-${item.widget}`}>
          <WidgetCard item={item} onUpdate={onUpdate} large />
        </div>
      )
    case 'sketch':
      return (
        <div className="detail-sketch">
          <SketchPreview strokes={item.strokes} fit={false} />
          {!readOnly && (
            <button className="btn btn-primary detail-float" onClick={onDraw}>
              <PenLine size={15} /> Edit sketch
            </button>
          )}
        </div>
      )
    case 'file':
      return (
        <div className="detail-file">
          <b>{item.name}</b>
          <span>{formatBytes(item.bytes)}</span>
          {url && (
            <a className="btn btn-primary" href={url} download={item.name}>
              <Download size={15} /> Download
            </a>
          )}
        </div>
      )
    case 'link': {
      const link = describeLink(item)
      if (!allowEmbeds) link.parsed.embedUrl = undefined
      // Players and design tools are worth embedding; other pages show their preview image.
      const embeddable = link.parsed.embedUrl && ['video', 'doc'].includes(link.parsed.variant)
      return (
        <div className="detail-link">
          {embeddable ? (
            <iframe className={`detail-embed variant-${link.parsed.variant}`} src={link.parsed.embedUrl} title={link.title} allow="autoplay; encrypted-media; fullscreen; picture-in-picture; clipboard-write" allowFullScreen />
          ) : url ? (
            <img className="detail-media" src={url} alt="" />
          ) : (
            <PlatformBadge platform={link.parsed.platform} size={72} />
          )}
        </div>
      )
    }
  }
}

interface Props {
  item: Item
  allTags: string[]
  hasPrev: boolean
  hasNext: boolean
  onPrev: () => void
  onNext: () => void
  onUpdate: (patch: Partial<Item>) => void
  onRemove: () => void
  onDraw: () => void
  onClose: () => void
  onTagged?: () => void
  onDescribed?: () => void
}

/** mymind-style card view: the thing itself on the left, its title, notes and tags on the right. */
export function CardDetail({ item, allTags, hasPrev, hasNext, onPrev, onNext, onUpdate, onRemove, onDraw, onClose, onTagged, onDescribed }: Props) {
  const { readOnly } = useBoardEnv()
  const [title, setTitle] = useState(item.caption ?? '')
  const [description, setDescription] = useState(item.description ?? '')
  const descriptionRef = useRef<HTMLTextAreaElement>(null)
  const hadDescription = useRef(!!item.description)

  useEffect(() => {
    setTitle(item.caption ?? '')
    setDescription(item.description ?? '')
    hadDescription.current = !!item.description
  }, [item.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-grow the description as it gets longer.
  useEffect(() => {
    const el = descriptionRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [description])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      const typing = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
      if (e.key === 'Escape') onClose()
      else if (!typing && e.key === 'ArrowLeft' && hasPrev) onPrev()
      else if (!typing && e.key === 'ArrowRight' && hasNext) onNext()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [hasPrev, hasNext, onPrev, onNext, onClose])

  const saveTitle = () => {
    const value = title.trim()
    if (value !== (item.caption ?? '')) onUpdate({ caption: value || undefined })
  }

  const saveDescription = () => {
    const value = description.trim()
    if (value === (item.description ?? '')) return
    onUpdate({ description: value || undefined })
    if (value && !hadDescription.current) onDescribed?.()
    hadDescription.current = !!value
  }

  const link = item.kind === 'link' ? describeLink(item) : null
  const placeholderTitle = item.kind === 'text' ? docTitle(item.blocks) : link?.title

  return createPortal(
    <div className="detail-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <button className="detail-nav prev" onClick={onPrev} disabled={!hasPrev} aria-label="Previous card">
        <ChevronLeft size={22} />
      </button>
      <div className={`detail kind-${item.kind}`} role="dialog" aria-label="Card details">
        <div className="detail-preview">
          <Preview item={item} onUpdate={onUpdate} onDraw={onDraw} />
        </div>

        <aside className="detail-side">
          <div className="detail-side-head">
            <span className="detail-kind">
              {link ? (
                <>
                  <PlatformBadge platform={link.parsed.platform} size={20} /> {PLATFORM_LABEL[link.parsed.platform]}
                </>
              ) : (
                KIND_LABEL[item.kind]
              )}
            </span>
            <button className="icon-btn" onClick={onClose} aria-label="Close">
              <X size={18} />
            </button>
          </div>

          {readOnly ? (
            <h2 className="detail-title-static">{item.caption || placeholderTitle || 'Untitled'}</h2>
          ) : (
            <input
              className="detail-title"
              value={title}
              placeholder={placeholderTitle || 'Add a title'}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={saveTitle}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            />
          )}

          {link && (
            <a className="detail-source" href={link.href} target="_blank" rel="noopener noreferrer">
              {hostLabel(link.href)} <ArrowUpRight size={14} />
            </a>
          )}

          <label className="detail-label">Description</label>
          {readOnly ? (
            <p className="detail-description-static">{item.description || <span className="detail-empty">No description</span>}</p>
          ) : (
            <textarea
              ref={descriptionRef}
              className="detail-description"
              value={description}
              rows={3}
              placeholder={link?.description || 'Add notes, context, why you saved it…'}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={saveDescription}
            />
          )}

          <label className="detail-label">Tags</label>
          <TagInput
            tags={item.tags ?? []}
            suggestions={allTags}
            readOnly={readOnly}
            onChange={(tags) => {
              if (tags.length && !item.tags?.length) onTagged?.()
              onUpdate({ tags: tags.length ? tags : undefined })
            }}
          />

          <div className="detail-meta">
            Added {new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).format(item.createdAt)}
          </div>

          {!readOnly && (
            <button className="btn detail-delete" onClick={onRemove}>
              <Trash2 size={15} /> Move to Trash
            </button>
          )}
        </aside>
      </div>
      <button className="detail-nav next" onClick={onNext} disabled={!hasNext} aria-label="Next card">
        <ChevronRight size={22} />
      </button>
    </div>,
    document.body,
  )
}
