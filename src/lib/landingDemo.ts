import type { DocBlock, Item, Stroke } from '../types'
import { createDocBlock } from './blocks'

// Sample content for the landing page. Photos live in /public/landing (Unsplash License);
// demo items reference them by path, and the landing's BoardEnv turns ids into URLs.

export const photo = (n: number) => `landing/${String(n).padStart(2, '0')}.jpg`
export const demoBlobUrl = (id: string) => `/${id}`

const at = Date.UTC(2026, 8, 1)
let seq = 0
const id = () => `demo-${++seq}`

function block(type: DocBlock['type'], text = '', extra: Partial<DocBlock> = {}): DocBlock {
  return { ...createDocBlock(type, text), id: id(), ...extra }
}

function circle(cx: number, cy: number, r: number, steps = 48): Stroke['points'] {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const a = (i / steps) * Math.PI * 2
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.96, 0.5]
  })
}

function wave(x0: number, x1: number, y: number, amp: number, waves: number): Stroke['points'] {
  const steps = 60
  return Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps
    return [x0 + (x1 - x0) * t, y + Math.sin(t * Math.PI * 2 * waves) * amp, 0.5]
  })
}

/** A little sun over the sea, drawn with the same stroke format the editor saves. */
export const DEMO_STROKES: Stroke[] = [
  { points: circle(600, 360, 120), color: '#f76b15', size: 12 },
  ...Array.from({ length: 8 }, (_, i): Stroke => {
    const a = (i / 8) * Math.PI * 2
    return {
      points: [
        [600 + Math.cos(a) * 160, 360 + Math.sin(a) * 160, 0.5],
        [600 + Math.cos(a) * 215, 360 + Math.sin(a) * 215, 0.5],
      ],
      color: '#f5c400',
      size: 10,
    }
  }),
  { points: wave(260, 940, 620, 18, 3), color: '#0d99ff', size: 12 },
  { points: wave(330, 870, 690, 12, 2.5), color: '#0d99ff', size: 8 },
]

export const DEMO_ITEMS: Item[] = [
  { id: id(), kind: 'image', blobId: photo(13), size: 'L', createdAt: at, caption: 'Studio corner', tags: ['interior'] },
  {
    id: id(),
    kind: 'text',
    size: 'M',
    createdAt: at,
    caption: 'Launch plan',
    blocks: [
      block('h2', 'Spring launch'),
      block('text', 'Everything for the shoot in one place.'),
      block('todo', 'Book the studio', { checked: true }),
      block('todo', 'Pick the palette', { checked: true }),
      block('todo', 'Send the brief'),
      block('callout', 'Collect first, sort later.'),
      block('bulleted', 'Moodboard'),
      block('bulleted', 'References'),
    ],
  },
  { id: id(), kind: 'widget', widget: 'weather', size: 'S', createdAt: at, city: { name: 'Lisbon', country: 'Portugal', latitude: 38.72, longitude: -9.14, timezone: 'Europe/Lisbon' } },
  {
    id: id(),
    kind: 'link',
    url: 'https://www.pinterest.com/',
    status: 'ready',
    size: 'M',
    createdAt: at,
    thumbId: photo(20),
    title: 'Monochrome styling',
    author: 'Pinterest',
    caption: 'Color blocking',
  },
  { id: id(), kind: 'widget', widget: 'clock', size: 'S', createdAt: at, city: { name: 'Tokyo', country: 'Japan', latitude: 35.68, longitude: 139.69, timezone: 'Asia/Tokyo' } },
  {
    id: id(),
    kind: 'link',
    url: 'https://www.figma.com/',
    status: 'ready',
    size: 'S',
    createdAt: at,
    title: 'Brand system v3',
    metaDescription: 'Type, color and components',
  },
  { id: id(), kind: 'sketch', size: 'S', createdAt: at, strokes: DEMO_STROKES, caption: 'Logo idea' },
  { id: id(), kind: 'image', blobId: photo(11), size: 'S', createdAt: at, caption: 'Product red' },
  { id: id(), kind: 'image', blobId: photo(16), size: 'M', createdAt: at, tags: ['architecture'] },
  {
    id: id(),
    kind: 'link',
    url: 'https://www.notion.so/',
    status: 'ready',
    size: 'S',
    createdAt: at,
    title: 'Launch checklist',
    metaDescription: 'Team workspace',
  },
  { id: id(), kind: 'widget', widget: 'calendar', size: 'S', createdAt: at },
  { id: id(), kind: 'image', blobId: photo(1), size: 'M', createdAt: at, caption: 'Morning ritual' },
  {
    id: id(),
    kind: 'link',
    url: 'https://www.instagram.com/wardrobe.edit/',
    status: 'ready',
    size: 'S',
    createdAt: at,
    thumbId: photo(22),
    title: 'Wardrobe Edit (@wardrobe.edit)',
    metaDescription: '48.2K Followers, 310 Following',
  },
  { id: id(), kind: 'image', blobId: photo(24), size: 'L', createdAt: at, caption: 'Above the clouds' },
  {
    id: id(),
    kind: 'text',
    size: 'S',
    createdAt: at,
    blocks: [block('emoji', '', { icon: '🌿' }), block('h3', 'Keep it light'), block('text', 'Soft greens, warm wood, lots of air.')],
  },
  { id: id(), kind: 'image', blobId: photo(10), size: 'S', createdAt: at },
]
