import { useEffect, useRef, useState, type RefObject } from 'react'
import { photo } from '../../lib/landingDemo'

/** Small deterministic PRNG so the layout is stable between visits. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const PHOTOS = Array.from({ length: 28 }, (_, i) => photo(i + 1))

/** Near tiles are crisp; far ones wash out, like depth of field. */
const LAYERS = [
  { scale: 0.72, parallax: 6 },
  { scale: 0.9, parallax: 12 },
  { scale: 1.08, parallax: 20 },
]

interface Tile {
  src: string
  /** Offset of the tile's center from the field's center, in px. */
  cx: number
  cy: number
  left: number
  top: number
  width: number
  height: number
  layer: number
  rx: number
  ry: number
  rz: number
  duration: number
  delay: number
}

interface Props {
  seed: number
  /** The text block tiles must stay clear of. */
  avoid: RefObject<HTMLElement | null>
  /** How full the space is (1 ≈ one tile per 1.7-tile-wide square). */
  density?: number
  /** Tiles drift outward and grow as the section scrolls away. */
  scrollDepth?: boolean
}

/**
 * Photos spread evenly through the space, never over the headline or the nav —
 * calm objects floating at different depths rather than a pile.
 */
export function FloatingField({ seed, avoid, density = 0.8, scrollDepth = true }: Props) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [tiles, setTiles] = useState<Tile[]>([])

  useEffect(() => {
    const root = rootRef.current
    if (!root) return

    const layout = () => {
      const rootRect = root.getBoundingClientRect()
      const { width, height } = rootRect
      if (!width || !height) return
      const rand = mulberry32(seed)
      const base = Math.min(128, Math.max(58, width * 0.068))
      const navBand = 84

      const text = avoid.current?.getBoundingClientRect()
      const pad = base * 0.7
      const blocked = text && {
        left: text.left - rootRect.left - pad,
        right: text.right - rootRect.left + pad,
        top: text.top - rootRect.top - pad,
        bottom: text.bottom - rootRect.top + pad,
      }
      const isFree = (x: number, y: number, half: number) =>
        y - half >= navBand &&
        !(blocked && x + half > blocked.left && x - half < blocked.right && y + half > blocked.top && y - half < blocked.bottom)

      // Mitchell's best-candidate sampling: each tile goes where it's farthest from the
      // others, which spreads tiles evenly instead of letting them clump.
      const spacing = base * 1.6
      const target = Math.round(((width * height) / (spacing * spacing)) * density)
      const next: Tile[] = []
      let photoIndex = Math.floor(rand() * PHOTOS.length)
      for (let n = 0; n < target; n++) {
        const layerRoll = rand()
        const shape = rand()
        const layer = layerRoll < 0.34 ? 0 : layerRoll < 0.72 ? 1 : 2
        const w = base * LAYERS[layer].scale * (0.85 + shape * 0.3)
        const h = w * [1, 0.72, 1.3, 0.8][Math.floor(shape * 4)]
        const half = Math.max(w, h) * 0.5

        let best: { x: number; y: number } | null = null
        let bestDistance = 0
        for (let k = 0; k < 30; k++) {
          // Edges attract best-candidate picks, so keep centers a little inside the frame.
          const x = base * 0.35 + rand() * (width - base * 0.7)
          const y = rand() * (height + base * 0.3)
          if (!isFree(x, y, half)) continue
          const distance = next.reduce((d, t) => Math.min(d, Math.hypot(t.cx + width / 2 - x, t.cy + height / 2 - y)), Infinity)
          if (distance > bestDistance) {
            best = { x, y }
            bestDistance = distance
          }
        }
        // Far enough that even tall neighbours don't touch.
        if (!best || bestDistance < base * 1.5) continue

        next.push({
          src: PHOTOS[photoIndex++ % PHOTOS.length],
          cx: best.x - width / 2,
          cy: best.y - height / 2,
          left: best.x - w / 2,
          top: best.y - h / 2,
          width: w,
          height: h,
          layer,
          rx: (rand() - 0.5) * 50,
          ry: (rand() - 0.5) * 50,
          rz: (rand() - 0.5) * 40,
          duration: 10 + rand() * 10,
          delay: -rand() * 20,
        })
      }
      setTiles(next)
    }

    layout()
    let timer = 0
    const onResize = () => {
      clearTimeout(timer)
      timer = window.setTimeout(layout, 150)
    }
    window.addEventListener('resize', onResize)
    // Web fonts change the headline's size after first paint.
    document.fonts?.ready.then(layout)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('resize', onResize)
    }
  }, [seed, avoid, density])

  // Scroll pushes tiles outward; the pointer shifts layers at different speeds.
  useEffect(() => {
    const root = rootRef.current
    if (!root || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let frame = 0
    const update = () => {
      frame = 0
      const rect = root.getBoundingClientRect()
      root.style.setProperty('--depth', String(Math.min(1, Math.max(0, -rect.top / rect.height))))
    }
    const onScroll = () => {
      if (scrollDepth && !frame) frame = requestAnimationFrame(update)
    }
    const onPointer = (e: PointerEvent) => {
      root.style.setProperty('--mx', (e.clientX / window.innerWidth - 0.5).toFixed(3))
      root.style.setProperty('--my', (e.clientY / window.innerHeight - 0.5).toFixed(3))
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('pointermove', onPointer, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('pointermove', onPointer)
      cancelAnimationFrame(frame)
    }
  }, [scrollDepth])

  return (
    <div ref={rootRef} className="field" aria-hidden>
      {tiles.map((t, i) => (
        <div
          key={i}
          className={`field-tile layer-${t.layer}`}
          style={
            {
              left: t.left,
              top: t.top,
              width: t.width,
              height: t.height,
              '--ox': `${(t.cx * 0.45).toFixed(0)}px`,
              '--oy': `${(t.cy * 0.45).toFixed(0)}px`,
              '--par': `${LAYERS[t.layer].parallax}px`,
              '--grow': (0.15 + t.layer * 0.25).toFixed(2),
            } as React.CSSProperties
          }
        >
          <div
            className="field-tilt"
            style={
              {
                '--rx': `${t.rx.toFixed(1)}deg`,
                '--ry': `${t.ry.toFixed(1)}deg`,
                '--rz': `${t.rz.toFixed(1)}deg`,
                '--dur': `${t.duration.toFixed(1)}s`,
                '--delay': `${t.delay.toFixed(1)}s`,
              } as React.CSSProperties
            }
          >
            <img src={`/${t.src}`} alt="" draggable={false} />
          </div>
        </div>
      ))}
    </div>
  )
}
