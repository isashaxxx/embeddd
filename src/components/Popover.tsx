import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export interface AnchorPosition {
  x: number
  y: number
  /** The anchor's top edge, used to open upward when there's no room below. */
  above?: number
  preferAbove?: boolean
}

/** Anchor a popover under the clicked element (or at the pointer for context menus). */
export function anchorFrom(e: React.MouseEvent): AnchorPosition {
  if (e.type === 'contextmenu') return { x: e.clientX, y: e.clientY }
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  return { x: rect.left, y: rect.bottom + 6, above: rect.top - 6 }
}

interface Props {
  position: AnchorPosition
  className?: string
  children: ReactNode
  onClose: () => void
}

export function Popover({ position, className, children, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x: position.x, y: position.y })
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  // Keep it inside the viewport; open upward when there's no room below.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const { width, height } = el.getBoundingClientRect()
    const fitsBelow = !position.preferAbove && position.y + height <= window.innerHeight - 8
    const top = fitsBelow ? position.y : (position.above ?? position.y) - height
    setPos({
      x: Math.max(8, Math.min(position.x, window.innerWidth - width - 8)),
      y: Math.max(8, top),
    })
  }, [position])

  useEffect(() => {
    const close = () => onCloseRef.current()
    const onPointerDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) close()
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    const onScroll = (e: Event) => {
      if (!ref.current?.contains(e.target as Node)) close()
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', close)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', close)
    }
  }, [])

  return createPortal(
    <div
      ref={ref}
      className={className}
      style={{ position: 'fixed', left: pos.x, top: pos.y }}
      // Portals bubble through the React tree: keep clicks and drags from reaching the card behind.
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => {
        e.preventDefault()
        e.stopPropagation()
      }}
      onDragStart={(e) => e.stopPropagation()}
    >
      {children}
    </div>,
    document.body,
  )
}
