import { useEffect, useRef, useState, type ComponentType } from 'react'
import {
  CalendarDays,
  Clapperboard,
  Clock,
  CloudSun,
  Code,
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  Image,
  List,
  ListCollapse,
  ListOrdered,
  ListTodo,
  MessageSquareText,
  Minus,
  Paperclip,
  PenLine,
  Pilcrow,
  Quote,
  Smile,
  type LucideProps,
} from 'lucide-react'
import { BLOCK_DEFS } from '../lib/blocks'
import type { BlockType, WidgetType } from '../types'
import { Popover, type AnchorPosition } from './Popover'

export interface CommandOption<T> {
  key: string
  label: string
  description: string
  keywords?: string
  Icon: ComponentType<LucideProps>
  value: T
  section?: string
}

interface MenuProps<T> {
  position: AnchorPosition
  options: CommandOption<T>[]
  placeholder: string
  onPick: (value: T) => void
  onClose: () => void
  /** Keep focus in the text being edited (slash menu) instead of a filter field. */
  initialQuery?: string
}

/** Notion's "/" menu: type to filter, arrows to move, Enter to insert. */
export function CommandMenu<T>({ position, options: all, placeholder, onPick, onClose, initialQuery = '' }: MenuProps<T>) {
  const [query, setQuery] = useState(initialQuery)
  const [active, setActive] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  const q = query.trim().toLowerCase()
  const options = q ? all.filter((o) => `${o.label} ${o.keywords ?? ''}`.toLowerCase().includes(q)) : all

  useEffect(() => setActive(0), [q])

  useEffect(() => {
    listRef.current?.querySelector('.active')?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const pick = (option: CommandOption<T> | undefined) => {
    if (!option) return
    onClose()
    onPick(option.value)
  }

  return (
    <Popover position={position} className="popover block-menu" onClose={onClose}>
      <input
        className="popover-input"
        autoFocus
        value={query}
        placeholder={placeholder}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setActive((a) => Math.min(a + 1, options.length - 1))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setActive((a) => Math.max(a - 1, 0))
          } else if (e.key === 'Enter') {
            e.preventDefault()
            pick(options[active])
          }
        }}
      />
      <div className="block-menu-list" ref={listRef}>
        {options.length === 0 && <div className="block-menu-empty">No results</div>}
        {options.map((o, i) => (
          <div key={o.key}>
            {o.section && (i === 0 || options[i - 1].section !== o.section) && <div className="block-menu-section">{o.section}</div>}
            <button
              className={`block-option${i === active ? ' active' : ''}`}
              onMouseEnter={() => setActive(i)}
              onClick={() => pick(o)}
            >
              <span className="block-option-icon">
                <o.Icon size={18} strokeWidth={1.6} />
              </span>
              <span className="block-option-text">
                <span>{o.label}</span>
                <small>{o.description}</small>
              </span>
            </button>
          </div>
        ))}
      </div>
    </Popover>
  )
}

export const BLOCK_ICONS: Record<BlockType, ComponentType<LucideProps>> = {
  text: Pilcrow,
  h1: Heading1,
  h2: Heading2,
  h3: Heading3,
  h4: Heading4,
  bulleted: List,
  numbered: ListOrdered,
  todo: ListTodo,
  toggle: ListCollapse,
  quote: Quote,
  callout: MessageSquareText,
  divider: Minus,
  code: Code,
  emoji: Smile,
}

export const BLOCK_OPTIONS: CommandOption<BlockType>[] = BLOCK_DEFS.map((d) => ({
  key: d.type,
  label: d.label,
  description: d.description,
  keywords: d.keywords,
  Icon: BLOCK_ICONS[d.type],
  value: d.type,
}))

export type AddChoice =
  | { kind: 'text' }
  | { kind: 'sketch' }
  | { kind: 'widget'; widget: WidgetType }
  | { kind: 'photo' | 'video' | 'file' }

/** What the composer's "+" can add to a board. */
export const ADD_OPTIONS: CommandOption<AddChoice>[] = [
  { key: 'text', section: 'Basic', label: 'Text', description: 'Notes with headings, lists, to-dos, code…', keywords: 'note doc heading list todo quote callout code', Icon: Pilcrow, value: { kind: 'text' } },
  { key: 'sketch', section: 'Basic', label: 'Sketch', description: 'Draw with a pen, like on paper.', keywords: 'draw pen doodle', Icon: PenLine, value: { kind: 'sketch' } },
  { key: 'photo', section: 'Media', label: 'Photo', description: 'Upload an image.', keywords: 'image picture', Icon: Image, value: { kind: 'photo' } },
  { key: 'video', section: 'Media', label: 'Video', description: 'Upload a video.', keywords: 'movie clip', Icon: Clapperboard, value: { kind: 'video' } },
  { key: 'file', section: 'Media', label: 'File', description: 'Upload any file.', keywords: 'attachment pdf document', Icon: Paperclip, value: { kind: 'file' } },
  { key: 'clock', section: 'Widgets', label: 'Clock', description: 'Local time anywhere in the world.', keywords: 'time timezone', Icon: Clock, value: { kind: 'widget', widget: 'clock' } },
  { key: 'weather', section: 'Widgets', label: 'Weather', description: 'Current weather and forecast.', keywords: 'forecast temperature', Icon: CloudSun, value: { kind: 'widget', widget: 'weather' } },
  { key: 'calendar', section: 'Widgets', label: 'Calendar', description: 'Today and this month at a glance.', keywords: 'date month', Icon: CalendarDays, value: { kind: 'widget', widget: 'calendar' } },
]
