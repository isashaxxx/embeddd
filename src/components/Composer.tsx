import { useEffect, useRef, useState } from 'react'
import { ArrowUp, Clapperboard, Image, Link2, Plus } from 'lucide-react'
import { normalizeUrl, parseLink } from '../lib/platforms'
import type { WidgetType } from '../types'
import { ADD_OPTIONS, CommandMenu, type AddChoice } from './BlockMenu'
import { PlatformBadge } from './PlatformBadge'
import type { AnchorPosition } from './Popover'

interface Props {
  onLink: (url: string) => void
  onFiles: (files: File[], options?: { asAttachments?: boolean }) => void
  onText: () => void
  onSketch: () => void
  onWidget: (widget: WidgetType) => void
}

function isEditableTarget(target: EventTarget | null) {
  const el = target as HTMLElement | null
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)
}

export function Composer({ onLink, onFiles, onText, onSketch, onWidget }: Props) {
  const [value, setValue] = useState('')
  const [menu, setMenu] = useState<AnchorPosition | null>(null)
  const photoInput = useRef<HTMLInputElement>(null)
  const videoInput = useRef<HTMLInputElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const plusButton = useRef<HTMLButtonElement>(null)
  const url = normalizeUrl(value)
  const parsed = url ? parseLink(url) : null

  const closedAt = useRef(0)

  const openMenu = () => {
    const rect = plusButton.current?.getBoundingClientRect()
    if (rect) setMenu({ x: rect.left - 120, y: rect.top - 8, above: rect.top - 8, preferAbove: true })
  }

  const closeMenu = () => {
    closedAt.current = Date.now()
    setMenu(null)
  }

  // "/" opens the add menu, like Notion.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || isEditableTarget(e.target)) return
      e.preventDefault()
      openMenu()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const pickFiles = (asAttachments: boolean) => (e: React.ChangeEvent<HTMLInputElement>) => {
    onFiles(Array.from(e.target.files ?? []), { asAttachments })
    e.target.value = ''
  }

  const onPick = (choice: AddChoice) => {
    if (choice.kind === 'text') onText()
    else if (choice.kind === 'sketch') onSketch()
    else if (choice.kind === 'widget') onWidget(choice.widget)
    else if (choice.kind === 'photo') photoInput.current?.click()
    else if (choice.kind === 'video') videoInput.current?.click()
    else fileInput.current?.click()
  }

  return (
    <div className="composer">
      <form
        className="composer-input"
        onSubmit={(e) => {
          e.preventDefault()
          if (!url) return
          onLink(url)
          setValue('')
        }}
      >
        {parsed ? (
          <PlatformBadge platform={parsed.platform} shorts={url?.includes('/shorts/')} size={26} />
        ) : (
          <Link2 className="muted" size={18} />
        )}
        <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="Paste a link…" aria-label="Link" />
        <button type="submit" className="send" disabled={!url} aria-label="Add link">
          <ArrowUp size={18} />
        </button>
      </form>

      <button className="tool" onClick={() => photoInput.current?.click()} title="Add photo" aria-label="Add photo">
        <Image size={20} strokeWidth={1.7} />
      </button>
      <button className="tool" onClick={() => videoInput.current?.click()} title="Add video" aria-label="Add video">
        <Clapperboard size={20} strokeWidth={1.7} />
      </button>
      <button
        ref={plusButton}
        className={`tool tool-plus${menu ? ' active' : ''}`}
        // The outside-click that closed the menu shouldn't immediately reopen it.
        onClick={() => Date.now() - closedAt.current > 250 && openMenu()}
        title="Add text, sketch or widget ( / )"
        aria-label="Add"
      >
        <Plus size={20} strokeWidth={1.9} />
      </button>

      <input ref={photoInput} type="file" accept="image/*" multiple hidden onChange={pickFiles(false)} />
      <input ref={videoInput} type="file" accept="video/*" multiple hidden onChange={pickFiles(false)} />
      <input ref={fileInput} type="file" multiple hidden onChange={pickFiles(true)} />

      {menu && <CommandMenu position={menu} options={ADD_OPTIONS} placeholder="Add to board…" onPick={onPick} onClose={closeMenu} />}
    </div>
  )
}
