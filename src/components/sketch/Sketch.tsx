import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Eraser, PenLine, Redo2, Trash2, Undo2 } from 'lucide-react'
import { CANVAS, hitsStroke, PEN_COLORS, PEN_SIZES, sketchViewBox, strokePath } from '../../lib/sketch'
import type { SketchItem, Stroke } from '../../types'

export function SketchPreview({ strokes, fit = true }: { strokes: Stroke[]; fit?: boolean }) {
  return (
    <svg
      className="sketch-svg"
      viewBox={fit ? sketchViewBox(strokes) : `0 0 ${CANVAS.width} ${CANVAS.height}`}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden
    >
      {strokes.map((s, i) => (
        <path key={i} d={strokePath(s)} fill={s.color} />
      ))}
    </svg>
  )
}

export function SketchCard({ item, readOnly }: { item: SketchItem; readOnly: boolean }) {
  if (!item.strokes.length) {
    return (
      <div className="sketch-card empty">
        <PenLine size={22} strokeWidth={1.5} />
        <span>{readOnly ? 'Empty sketch' : 'Click to draw'}</span>
      </div>
    )
  }
  return (
    <div className="sketch-card">
      <SketchPreview strokes={item.strokes} />
    </div>
  )
}

interface EditorProps {
  initial: Stroke[]
  onSave: (strokes: Stroke[]) => void
  onClose: () => void
}

/** Full-screen drawing surface, Milanote-style: pen, colors, sizes, eraser, undo/redo. */
export function SketchEditor({ initial, onSave, onClose }: EditorProps) {
  const [state, setState] = useState({ strokes: initial, past: [] as Stroke[][], future: [] as Stroke[][] })
  const { strokes } = state
  const [color, setColor] = useState(PEN_COLORS[0])
  const [size, setSize] = useState(PEN_SIZES[1])
  const [tool, setTool] = useState<'pen' | 'eraser'>('pen')
  const [current, setCurrent] = useState<Stroke | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const drawing = useRef(false)
  const strokesRef = useRef(strokes)
  strokesRef.current = strokes

  /** Remembers the current drawing so the next change can be undone. */
  const checkpoint = () => setState((s) => ({ ...s, past: [...s.past, s.strokes].slice(-100), future: [] }))
  const commit = (next: Stroke[]) => setState((s) => ({ strokes: next, past: [...s.past, s.strokes].slice(-100), future: [] }))
  const undo = () =>
    setState((s) => (s.past.length ? { strokes: s.past[s.past.length - 1], past: s.past.slice(0, -1), future: [s.strokes, ...s.future] } : s))
  const redo = () =>
    setState((s) => (s.future.length ? { strokes: s.future[0], past: [...s.past, s.strokes], future: s.future.slice(1) } : s))

  const save = () => {
    onSave(strokesRef.current)
    onClose()
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') save()
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
      }
      if (e.key === 'e') setTool('eraser')
      if (e.key === 'p') setTool('pen')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const toCanvas = (e: React.PointerEvent | PointerEvent): [number, number, number] => {
    const rect = svgRef.current!.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * CANVAS.width
    const y = ((e.clientY - rect.top) / rect.height) * CANVAS.height
    // Browsers report 0.5 for devices without pressure; pens send real values.
    const pressure = e.pointerType === 'pen' ? e.pressure || 0.5 : 0.5
    return [Math.round(x * 10) / 10, Math.round(y * 10) / 10, Math.round(pressure * 100) / 100]
  }

  const erase = (e: React.PointerEvent) => {
    const [x, y] = toCanvas(e)
    setState((s) => {
      const remaining = s.strokes.filter((stroke) => !hitsStroke(stroke, x, y, 14))
      return remaining.length === s.strokes.length ? s : { ...s, strokes: remaining }
    })
  }

  return createPortal(
    <div className="sketch-editor" role="dialog" aria-label="Sketch">
      <header className="sketch-toolbar">
        <div className="sketch-tools">
          <button className={`sketch-tool${tool === 'pen' ? ' active' : ''}`} onClick={() => setTool('pen')} title="Pen (P)">
            <PenLine size={18} />
          </button>
          <button className={`sketch-tool${tool === 'eraser' ? ' active' : ''}`} onClick={() => setTool('eraser')} title="Eraser (E)">
            <Eraser size={18} />
          </button>
          <span className="sketch-sep" />
          {PEN_COLORS.map((c) => (
            <button
              key={c}
              className={`sketch-color${color === c && tool === 'pen' ? ' active' : ''}`}
              style={{ background: c }}
              onClick={() => {
                setColor(c)
                setTool('pen')
              }}
              aria-label={`Color ${c}`}
            />
          ))}
          <span className="sketch-sep" />
          {PEN_SIZES.map((s) => (
            <button
              key={s}
              className={`sketch-size${size === s ? ' active' : ''}`}
              onClick={() => {
                setSize(s)
                setTool('pen')
              }}
              aria-label={`Size ${s}`}
            >
              <span style={{ width: 4 + s / 2, height: 4 + s / 2 }} />
            </button>
          ))}
          <span className="sketch-sep" />
          <button className="sketch-tool" onClick={undo} disabled={!state.past.length} title="Undo (⌘Z)">
            <Undo2 size={18} />
          </button>
          <button className="sketch-tool" onClick={redo} disabled={!state.future.length} title="Redo (⇧⌘Z)">
            <Redo2 size={18} />
          </button>
          <button className="sketch-tool" onClick={() => commit([])} disabled={!strokes.length} title="Clear">
            <Trash2 size={18} />
          </button>
        </div>
        <div className="sketch-actions">
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={save}>
            Done
          </button>
        </div>
      </header>

      <div className="sketch-stage">
        <svg
          ref={svgRef}
          className={`sketch-paper tool-${tool}`}
          viewBox={`0 0 ${CANVAS.width} ${CANVAS.height}`}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId)
            drawing.current = true
            if (tool === 'eraser') {
              checkpoint()
              erase(e)
            } else {
              setCurrent({ points: [toCanvas(e)], color, size })
            }
          }}
          onPointerMove={(e) => {
            if (!drawing.current) return
            if (tool === 'eraser') return erase(e)
            // Coalesced events keep fast strokes smooth.
            const coalesced = e.nativeEvent.getCoalescedEvents?.()
            const events = coalesced?.length ? coalesced : [e.nativeEvent]
            const points = events.map((ev) => toCanvas(ev))
            setCurrent((c) => (c ? { ...c, points: [...c.points, ...points] } : c))
          }}
          onPointerUp={() => {
            drawing.current = false
            if (current && current.points.length) commit([...strokesRef.current, current])
            setCurrent(null)
          }}
        >
          {strokes.map((s, i) => (
            <path key={i} d={strokePath(s)} fill={s.color} />
          ))}
          {current && <path d={strokePath(current)} fill={current.color} />}
        </svg>
      </div>
    </div>,
    document.body,
  )
}
