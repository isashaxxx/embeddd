import { useState } from 'react'
import { Captions, Maximize2, PenLine, Settings2, Trash2 } from 'lucide-react'
import { useBoardEnv } from '../lib/boardEnv'
import type { Item, Size, WidgetItem } from '../types'
import { CardContent } from './cards/CardContent'
import { EditableText } from './EditableText'
import { anchorFrom, type AnchorPosition } from './Popover'
import { WidgetSettings } from './widgets/WidgetSettings'

export const CARD_DRAG_TYPE = 'application/x-embeddd-card'
const SIZES: Size[] = ['S', 'M', 'L']

/** Kinds whose card body opens the detail view on click (text and widgets are interactive in place). */
const OPENS_ON_CLICK: Item['kind'][] = ['image', 'video', 'file', 'link']

interface Props {
  item: Item
  autoFocus: boolean
  isDropTarget: boolean
  selected: boolean
  onSelect: () => void
  onOpen: () => void
  onDraw: () => void
  onUpdate: (patch: Partial<Item>) => void
  onRemove: () => void
  onDragStart: () => void
  onDragOver: () => void
  onDrop: () => void
  onDragEnd: () => void
}

export function Card(props: Props) {
  const { item, autoFocus, isDropTarget, selected, onSelect, onOpen, onDraw, onUpdate, onRemove } = props
  const { readOnly } = useBoardEnv()
  const [settings, setSettings] = useState<AnchorPosition | null>(null)
  const [editingCaption, setEditingCaption] = useState(false)
  const [typing, setTyping] = useState(false)
  const isCardDrag = (e: React.DragEvent) => e.dataTransfer.types.includes(CARD_DRAG_TYPE)

  const caption = item.caption ?? ''
  const showCaption = !!caption || editingCaption

  const classes = [
    'card',
    `size-${item.size}`,
    `kind-${item.kind}`,
    item.kind === 'widget' && `widget-${item.widget}`,
    showCaption && 'has-caption',
    isDropTarget && 'drop-target',
    selected && 'selected',
  ]

  return (
    <div
      className={classes.filter(Boolean).join(' ')}
      // Touch has no hover: the first tap selects the card (revealing its toolbar),
      // the next one opens or plays it.
      onClickCapture={(e) => {
        if (readOnly || selected || !window.matchMedia('(hover: none)').matches) return
        e.preventDefault()
        e.stopPropagation()
        onSelect()
      }}
      // While typing, mouse drags must select text rather than move the card.
      draggable={!readOnly && !typing}
      onFocusCapture={(e) => setTyping((e.target as HTMLElement).isContentEditable)}
      onBlurCapture={() => setTyping(false)}
      onDragStart={(e) => {
        e.dataTransfer.setData(CARD_DRAG_TYPE, item.id)
        e.dataTransfer.effectAllowed = 'move'
        props.onDragStart()
      }}
      onDragOver={(e) => {
        if (readOnly || !isCardDrag(e)) return
        e.preventDefault()
        props.onDragOver()
      }}
      onDrop={(e) => {
        if (readOnly || !isCardDrag(e)) return
        e.preventDefault()
        e.stopPropagation()
        props.onDrop()
      }}
      onDragEnd={props.onDragEnd}
    >
      <div
        className="card-body"
        onClick={() => {
          if (OPENS_ON_CLICK.includes(item.kind)) onOpen()
          else if (item.kind === 'sketch') (readOnly ? onOpen : onDraw)()
        }}
      >
        <CardContent item={item} autoFocus={autoFocus} onUpdate={onUpdate} />
      </div>

      {showCaption && (
        <EditableText
          className="card-caption"
          value={caption}
          readOnly={readOnly}
          autoFocus={editingCaption}
          placeholder="Add a title"
          onChange={(text) => onUpdate({ caption: text })}
          onBlur={(text) => {
            setEditingCaption(false)
            if (!text.trim()) onUpdate({ caption: undefined })
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              e.currentTarget.blur()
            }
          }}
        />
      )}

      {!readOnly && (
        <div className="card-toolbar" onClick={(e) => e.stopPropagation()}>
          {SIZES.map((s) => (
            <button
              key={s}
              className={s === item.size ? 'active' : ''}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onUpdate({ size: s })}
              aria-label={`Size ${s}`}
            >
              {s}
            </button>
          ))}
          <span className="sep" />
          <button onMouseDown={(e) => e.preventDefault()} onClick={onOpen} aria-label="Open" title="Open">
            <Maximize2 size={14} />
          </button>
          <button
            className={showCaption ? 'on' : ''}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => (showCaption && !editingCaption ? onUpdate({ caption: undefined }) : setEditingCaption(true))}
            aria-label={showCaption ? 'Remove title' : 'Add title'}
            title={showCaption ? 'Remove title' : 'Add title'}
          >
            <Captions size={15} />
          </button>
          {item.kind === 'sketch' && (
            <button onClick={onDraw} aria-label="Draw" title="Draw">
              <PenLine size={15} />
            </button>
          )}
          {item.kind === 'widget' && (
            <button onClick={(e) => setSettings(anchorFrom(e))} aria-label="Widget settings" title="Settings">
              <Settings2 size={15} />
            </button>
          )}
          <button onClick={onRemove} aria-label="Move to Trash" title="Move to Trash">
            <Trash2 size={15} />
          </button>
        </div>
      )}

      {settings && item.kind === 'widget' && (
        <WidgetSettings
          item={item}
          position={settings}
          onUpdate={(patch: Partial<WidgetItem>) => onUpdate(patch)}
          onClose={() => setSettings(null)}
        />
      )}
    </div>
  )
}
