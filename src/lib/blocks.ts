import type { BlockType, DocBlock, Item, NotionColor, Size, TextItem } from '../types'

export interface BlockDef {
  type: BlockType
  label: string
  description: string
  keywords: string
}

/** Order and copy follow Notion's "/" menu. */
export const BLOCK_DEFS: BlockDef[] = [
  { type: 'text', label: 'Text', description: 'Just start writing with plain text.', keywords: 'paragraph plain' },
  { type: 'h1', label: 'Heading 1', description: 'Big section heading.', keywords: 'title h1 #' },
  { type: 'h2', label: 'Heading 2', description: 'Medium section heading.', keywords: 'subtitle h2 ##' },
  { type: 'h3', label: 'Heading 3', description: 'Small section heading.', keywords: 'h3 ###' },
  { type: 'h4', label: 'Heading 4', description: 'Smallest section heading.', keywords: 'h4 ####' },
  { type: 'bulleted', label: 'Bulleted list', description: 'Create a simple bulleted list.', keywords: 'ul bullet -' },
  { type: 'numbered', label: 'Numbered list', description: 'Create a list with numbering.', keywords: 'ol ordered 1.' },
  { type: 'todo', label: 'To-do list', description: 'Track tasks with a to-do list.', keywords: 'checkbox task check []' },
  { type: 'toggle', label: 'Toggle list', description: 'Toggles can hide and show content inside.', keywords: 'collapse details >' },
  { type: 'quote', label: 'Quote', description: 'Capture a quote.', keywords: 'blockquote citation "' },
  { type: 'callout', label: 'Callout', description: 'Make writing stand out.', keywords: 'note tip info' },
  { type: 'divider', label: 'Divider', description: 'Visually divide blocks.', keywords: 'separator line hr ---' },
  { type: 'code', label: 'Code', description: 'Capture a code snippet.', keywords: 'snippet pre ```' },
  { type: 'emoji', label: 'Emoji', description: 'Add a big emoji.', keywords: 'icon sticker' },
]

export const BLOCK_LABEL = Object.fromEntries(BLOCK_DEFS.map((d) => [d.type, d.label])) as Record<BlockType, string>

/** Blocks that hold a line of editable text (divider and emoji don't). */
export const TEXTUAL: BlockType[] = ['text', 'h1', 'h2', 'h3', 'h4', 'bulleted', 'numbered', 'todo', 'toggle', 'quote', 'callout', 'code']

/** Pressing Enter at the end of these keeps the type, like continuing a list. */
export const CONTINUES: BlockType[] = ['bulleted', 'numbered', 'todo', 'toggle']

export const CODE_LANGUAGES = ['Plain text', 'JavaScript', 'TypeScript', 'Python', 'HTML', 'CSS', 'JSON', 'Bash', 'SQL', 'Markdown', 'Go', 'Rust', 'Swift']

export const NOTION_COLORS: NotionColor[] = ['default', 'gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red']

/** Notion's light-theme values. */
export const TEXT_COLOR: Record<NotionColor, string> = {
  default: '#111111',
  gray: '#787774',
  brown: '#9f6b53',
  orange: '#d9730d',
  yellow: '#cb912f',
  green: '#448361',
  blue: '#337ea9',
  purple: '#9065b0',
  pink: '#c14c8a',
  red: '#d44c47',
}

export const BG_COLOR: Record<NotionColor, string> = {
  default: 'transparent',
  gray: '#f1f1ef',
  brown: '#f4eeee',
  orange: '#fbecdd',
  yellow: '#fbf3db',
  green: '#edf3ec',
  blue: '#e7f3f8',
  purple: '#f6f3f9',
  pink: '#faf1f5',
  red: '#fdebec',
}

export const colorName = (c: NotionColor) => c[0].toUpperCase() + c.slice(1)

export function createDocBlock(type: BlockType, text = ''): DocBlock {
  const block: DocBlock = { id: crypto.randomUUID(), type }
  if (TEXTUAL.includes(type)) block.text = text
  if (type === 'callout') {
    block.icon = '💡'
    block.background = 'gray'
  }
  if (type === 'emoji') block.icon = '✨'
  if (type === 'code') block.language = 'JavaScript'
  return block
}

/** Changes a block's type but keeps what the user wrote, like Notion's "Turn into". */
export function turnInto(block: DocBlock, type: BlockType): DocBlock {
  const fresh = createDocBlock(type, block.text ?? '')
  return { ...fresh, id: block.id, color: block.color, background: type === 'callout' ? fresh.background : block.background }
}

export function createTextItem(type: BlockType = 'text'): TextItem {
  const blocks = [createDocBlock(type)]
  // A divider or emoji alone would leave nowhere to type.
  if (!TEXTUAL.includes(type)) blocks.push(createDocBlock('text'))
  return { id: crypto.randomUUID(), kind: 'text', blocks, size: 'S', createdAt: Date.now() }
}

/** Markdown shortcuts typed at the start of a Text block. */
export const MARKDOWN_SHORTCUTS: [RegExp, BlockType][] = [
  [/^####\s/, 'h4'],
  [/^###\s/, 'h3'],
  [/^##\s/, 'h2'],
  [/^#\s/, 'h1'],
  [/^[-*]\s/, 'bulleted'],
  [/^1[.)]\s/, 'numbered'],
  [/^\[\]\s/, 'todo'],
  [/^>\s/, 'toggle'],
  [/^"\s/, 'quote'],
  [/^```$/, 'code'],
  [/^---$/, 'divider'],
]

/* ---------- migrations ---------- */

interface LegacyEntry {
  id: string
  text: string
  checked?: boolean
  body?: string
}

type LegacyBlockItem = {
  kind: 'block'
  id: string
  size: Size
  createdAt: number
  type: BlockType
  text?: string
  entries?: LegacyEntry[]
  icon?: string
  language?: string
  color?: NotionColor
  background?: NotionColor
}

type LegacyTextItem = { kind: 'text'; id: string; size: Size; createdAt: number; text: string }

/** Upgrades items saved by older versions: single-purpose block cards became one Text document. */
export function normalizeItem(raw: Item | LegacyBlockItem | LegacyTextItem): Item {
  // Links used to keep the page's description in `description`, which is now the user's own note.
  if (raw.kind === 'link' && raw.metaDescription === undefined) {
    const { description, ...rest } = raw
    return { ...rest, metaDescription: description ?? '' }
  }
  if (raw.kind === 'text' && !('blocks' in raw)) {
    const legacy = raw as LegacyTextItem
    return { id: legacy.id, kind: 'text', size: legacy.size, createdAt: legacy.createdAt, blocks: [{ ...createDocBlock('text'), text: legacy.text }] }
  }
  if (raw.kind === 'block') {
    const { color, background } = raw
    let blocks: DocBlock[]
    if (raw.entries) {
      blocks = raw.entries.map((e) => ({ id: e.id, type: raw.type, text: e.text, checked: e.checked, body: e.body, color, background }))
    } else {
      blocks = [{ id: crypto.randomUUID(), type: raw.type, text: raw.text, icon: raw.icon, language: raw.language, color, background }]
    }
    return { id: raw.id, kind: 'text', size: raw.size, createdAt: raw.createdAt, blocks }
  }
  return raw
}

/* ---------- plain text ---------- */

export function docPlainText(blocks: DocBlock[]): string {
  let n = 0
  return blocks
    .map((b) => {
      n = b.type === 'numbered' ? n + 1 : 0
      const text = b.text ?? ''
      switch (b.type) {
        case 'bulleted':
          return `• ${text}`
        case 'numbered':
          return `${n}. ${text}`
        case 'todo':
          return `${b.checked ? '[x]' : '[ ]'} ${text}`
        case 'toggle':
          return `▸ ${text}${b.body ? `\n  ${b.body}` : ''}`
        case 'callout':
          return `${b.icon ?? ''} ${text}`.trim()
        case 'divider':
          return '———'
        case 'emoji':
          return b.icon ?? ''
        default:
          return text
      }
    })
    .join('\n')
}

/** First meaningful line, used as a fallback title. */
export function docTitle(blocks: DocBlock[]) {
  return blocks.map((b) => b.text?.trim()).find(Boolean) ?? ''
}
