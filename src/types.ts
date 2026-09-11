export type Size = 'S' | 'M' | 'L'

export type Columns = 4 | 6 | 8

export type Platform = 'notion' | 'miro' | 'figma' | 'pinterest' | 'instagram' | 'tiktok' | 'youtube' | 'web'

/** How a link is presented: visual media, a document/tool, a creator profile, or a plain page. */
export type LinkVariant = 'video' | 'post' | 'doc' | 'profile' | 'page'

/** Notion's palette; used for both text and background. */
export type NotionColor = 'default' | 'gray' | 'brown' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple' | 'pink' | 'red'

interface BaseItem {
  id: string
  size: Size
  createdAt: number
  /** The card's title, shown under it (Pinterest-style) and in the detail view. */
  caption?: string
  description?: string
  tags?: string[]
}

/* ---------- text: a small Notion document ---------- */

export type BlockType =
  | 'text'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'h4'
  | 'bulleted'
  | 'numbered'
  | 'todo'
  | 'toggle'
  | 'quote'
  | 'callout'
  | 'divider'
  | 'code'
  | 'emoji'

/** One line of a text card. Like Notion, lists are runs of consecutive list blocks. */
export interface DocBlock {
  id: string
  type: BlockType
  text?: string
  /** to-do */
  checked?: boolean
  /** toggle: content revealed when open */
  body?: string
  /** callout icon or the emoji block's emoji */
  icon?: string
  language?: string
  color?: NotionColor
  background?: NotionColor
}

export interface TextItem extends BaseItem {
  kind: 'text'
  blocks: DocBlock[]
}

/* ---------- media, files, links ---------- */

export interface MediaItem extends BaseItem {
  kind: 'image' | 'video'
  blobId: string
}

export interface FileItem extends BaseItem {
  kind: 'file'
  blobId: string
  name: string
  mime: string
  bytes: number
}

export interface LinkItem extends BaseItem {
  kind: 'link'
  url: string
  /** Final URL after redirects (pin.it, vm.tiktok.com short links). */
  resolvedUrl?: string
  status: 'loading' | 'ready'
  /** Page metadata from the link preview (the user's own title and notes are `caption` and `description`). */
  title?: string
  metaDescription?: string
  author?: string
  thumbId?: string
}

/* ---------- widgets ---------- */

export type WidgetType = 'clock' | 'weather' | 'calendar'

export interface City {
  name: string
  country?: string
  latitude: number
  longitude: number
  timezone: string
}

export interface WidgetItem extends BaseItem {
  kind: 'widget'
  widget: WidgetType
  city?: City
  clockStyle?: 'analog' | 'digital'
  units?: 'c' | 'f'
  /** 0 = Sunday, 1 = Monday */
  weekStart?: 0 | 1
}

/* ---------- sketch ---------- */

export interface Stroke {
  /** [x, y, pressure] in the sketch's virtual canvas */
  points: [number, number, number][]
  color: string
  size: number
}

export interface SketchItem extends BaseItem {
  kind: 'sketch'
  strokes: Stroke[]
}

export type Item = TextItem | MediaItem | FileItem | LinkItem | WidgetItem | SketchItem

/* ---------- workspace ---------- */

/** A folder of boards, like a Figma project. */
export interface Project {
  id: string
  name: string
  createdAt: number
}

/** A board is the "file": its items are stored separately under its id. */
export interface BoardMeta {
  id: string
  name: string
  /** null = Drafts */
  projectId: string | null
  createdAt: number
  updatedAt: number
  openedAt?: number
  columns?: Columns
  /** Set while the board is in Trash. */
  deletedAt?: number
}

/** A card removed from a board, kept in Trash with enough context to put it back. */
export interface TrashedCard {
  item: Item
  boardId: string
  boardName: string
  index: number
  deletedAt: number
}

export type ShareScope = 'project' | 'board'

/** Owner-side record of a published link. The secret authorizes updates. */
export interface ShareRecord {
  scope: ShareScope
  targetId: string
  token: string
  secret: string
  createdAt: number
  publishedAt?: number
}

/** What a public link serves: a read-only snapshot of one board or a whole project. */
export interface ShareManifest {
  version: 1
  scope: ShareScope
  name: string
  publishedAt: number
  boards: { id: string; name: string; updatedAt: number; columns?: Columns; items: Item[] }[]
  /** Public file URLs when the server stores files in Vercel Blob. */
  blobUrls?: Record<string, string>
}
