import { useEffect, useMemo, useRef, useState } from 'react'
import { useBoardEnv } from '../lib/boardEnv'
import type { Columns, Item, SketchItem } from '../types'
import { Card } from './Card'
import { CardDetail } from './CardDetail'
import { PlatformBadge } from './PlatformBadge'
import { SketchEditor } from './sketch/Sketch'

interface Props {
  items: Item[]
  columns: Columns
  focusId: string | null
  /** Opens a card straight into drawing (a sketch that was just added). */
  drawId?: string | null
  onUpdate: (id: string, patch: Partial<Item>) => void
  onRemove: (id: string) => void
  onMove: (fromId: string, toId: string) => void
  onTagged?: () => void
  onDescribed?: () => void
}

export function Board({ items, columns, focusId, drawId, onUpdate, onRemove, onMove, onTagged, onDescribed }: Props) {
  const dragId = useRef<string | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [drawingId, setDrawingId] = useState<string | null>(null)
  const [tag, setTag] = useState<string | null>(null)
  const { readOnly } = useBoardEnv()

  useEffect(() => {
    if (drawId) setDrawingId(drawId)
  }, [drawId])

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (!(e.target as Element).closest?.('.card')) setSelectedId(null)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [])

  const tagCounts = useMemo(() => {
    const counts = new Map<string, number>()
    items.forEach((i) => i.tags?.forEach((t) => counts.set(t, (counts.get(t) ?? 0) + 1)))
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  }, [items])

  const activeTag = tag && tagCounts.some(([t]) => t === tag) ? tag : null
  const visible = activeTag ? items.filter((i) => i.tags?.includes(activeTag)) : items

  const openIndex = visible.findIndex((i) => i.id === openId)
  const openItem = visible[openIndex]
  const drawingItem = items.find((i): i is SketchItem => i.id === drawingId && i.kind === 'sketch')

  if (!items.length) {
    if (readOnly) return <div className="empty"><h2>This board is empty</h2></div>
    return (
      <div className="empty">
        <div className="empty-badges">
          {(['notion', 'figma', 'miro', 'pinterest', 'instagram', 'tiktok', 'youtube'] as const).map((p) => (
            <PlatformBadge key={p} platform={p} shorts={p === 'youtube'} size={40} />
          ))}
        </div>
        <h2>Your board is empty</h2>
        <p>Paste a link anywhere, drop photos and videos, or press “/” to add notes, sketches and widgets.</p>
      </div>
    )
  }

  return (
    <>
      {tagCounts.length > 0 && (
        <div className="tag-filter">
          <button className={`tag-chip${!activeTag ? ' active' : ''}`} onClick={() => setTag(null)}>
            All <small>{items.length}</small>
          </button>
          {tagCounts.map(([t, count]) => (
            <button key={t} className={`tag-chip${activeTag === t ? ' active' : ''}`} onClick={() => setTag(activeTag === t ? null : t)}>
              #{t} <small>{count}</small>
            </button>
          ))}
        </div>
      )}

      <div className="grid" data-cols={columns}>
        {visible.map((item) => (
          <Card
            key={item.id}
            item={item}
            autoFocus={item.id === focusId}
            isDropTarget={dropTarget === item.id && dragId.current !== item.id}
            selected={selectedId === item.id}
            onSelect={() => setSelectedId(item.id)}
            onOpen={() => setOpenId(item.id)}
            onDraw={() => setDrawingId(item.id)}
            onUpdate={(patch) => onUpdate(item.id, patch)}
            onRemove={() => onRemove(item.id)}
            onDragStart={() => (dragId.current = item.id)}
            onDragOver={() => setDropTarget(item.id)}
            onDrop={() => {
              if (dragId.current) onMove(dragId.current, item.id)
              dragId.current = null
              setDropTarget(null)
            }}
            onDragEnd={() => {
              dragId.current = null
              setDropTarget(null)
            }}
          />
        ))}
      </div>

      {openItem && (
        <CardDetail
          item={openItem}
          allTags={tagCounts.map(([t]) => t)}
          hasPrev={openIndex > 0}
          hasNext={openIndex < visible.length - 1}
          onPrev={() => setOpenId(visible[openIndex - 1]?.id ?? openId)}
          onNext={() => setOpenId(visible[openIndex + 1]?.id ?? openId)}
          onUpdate={(patch) => onUpdate(openItem.id, patch)}
          onRemove={() => {
            const next = visible[openIndex + 1] ?? visible[openIndex - 1]
            onRemove(openItem.id)
            setOpenId(next?.id ?? null)
          }}
          onDraw={() => setDrawingId(openItem.id)}
          onClose={() => setOpenId(null)}
          onTagged={onTagged}
          onDescribed={onDescribed}
        />
      )}

      {drawingItem && !readOnly && (
        <SketchEditor
          key={drawingItem.id}
          initial={drawingItem.strokes}
          onSave={(strokes) => onUpdate(drawingItem.id, { strokes })}
          onClose={() => setDrawingId(null)}
        />
      )}
    </>
  )
}
