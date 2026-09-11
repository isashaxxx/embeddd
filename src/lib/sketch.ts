import { getStroke } from 'perfect-freehand'
import type { Stroke } from '../types'

/** The editor draws on a fixed virtual canvas so strokes look the same at any card size. */
export const CANVAS = { width: 1200, height: 900 }

export const PEN_COLORS = ['#111111', '#8a8a8a', '#e5484d', '#f76b15', '#f5c400', '#30a46c', '#0d99ff', '#8e4ec6']
export const PEN_SIZES = [4, 9, 18]

/** perfect-freehand outline → SVG path, as in the library's README. */
export function strokePath(stroke: Stroke) {
  const outline = getStroke(stroke.points, {
    size: stroke.size,
    thinning: 0.55,
    smoothing: 0.55,
    streamline: 0.45,
    // Mouse and trackpad have no pressure; fake it from speed.
    simulatePressure: stroke.points.every((p) => p[2] === 0.5),
  })
  if (outline.length < 2) return ''
  const mid = (a: number[], b: number[]) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
  let d = `M${outline[0][0].toFixed(1)},${outline[0][1].toFixed(1)} Q`
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i]
    const b = outline[(i + 1) % outline.length]
    const m = mid(a, b)
    d += `${a[0].toFixed(1)},${a[1].toFixed(1)} ${m[0].toFixed(1)},${m[1].toFixed(1)} `
  }
  return `${d}Z`
}

/** A viewBox around what was actually drawn, so small cards show the drawing, not empty paper. */
export function sketchViewBox(strokes: Stroke[], padding = 40) {
  if (!strokes.length) return `0 0 ${CANVAS.width} ${CANVAS.height}`
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const s of strokes) {
    for (const [x, y] of s.points) {
      minX = Math.min(minX, x - s.size)
      minY = Math.min(minY, y - s.size)
      maxX = Math.max(maxX, x + s.size)
      maxY = Math.max(maxY, y + s.size)
    }
  }
  const w = Math.max(maxX - minX, 120) + padding * 2
  const h = Math.max(maxY - minY, 120) + padding * 2
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2
  return `${(cx - w / 2).toFixed(0)} ${(cy - h / 2).toFixed(0)} ${w.toFixed(0)} ${h.toFixed(0)}`
}

export function sketchSvg(strokes: Stroke[]) {
  const paths = strokes.map((s) => `<path d="${strokePath(s)}" fill="${s.color}"/>`).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${sketchViewBox(strokes)}">${paths}</svg>`
}

/** Whether the eraser at (x, y) touches a stroke. */
export function hitsStroke(stroke: Stroke, x: number, y: number, radius: number) {
  const reach = radius + stroke.size / 2
  return stroke.points.some(([px, py]) => (px - x) ** 2 + (py - y) ** 2 <= reach * reach)
}
