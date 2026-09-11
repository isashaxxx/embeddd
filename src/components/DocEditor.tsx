import { useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { Check, ChevronRight, Copy, CopyPlus, GripVertical, Palette, Repeat2, Trash2 } from 'lucide-react'
import {
  BG_COLOR,
  CODE_LANGUAGES,
  CONTINUES,
  createDocBlock,
  MARKDOWN_SHORTCUTS,
  TEXT_COLOR,
  TEXTUAL,
  turnInto,
} from '../lib/blocks'
import { useBoardEnv } from '../lib/boardEnv'
import type { BlockType, DocBlock } from '../types'
import { BLOCK_OPTIONS, CommandMenu } from './BlockMenu'
import { ColorMenu } from './ColorMenu'
import { EditableText, getCaretOffset, setCaret } from './EditableText'
import { EmojiPicker } from './EmojiPicker'
import { Menu } from './Menu'
import { anchorFrom, type AnchorPosition } from './Popover'

interface Props {
  blocks: DocBlock[]
  onChange: (blocks: DocBlock[]) => void
  autoFocus?: boolean
  className?: string
}

type OpenMenu = { kind: 'slash' | 'turn' | 'handle' | 'color' | 'emoji'; blockId: string; position: AnchorPosition }

const PLACEHOLDER: Partial<Record<BlockType, string>> = {
  text: "Type '/' for commands",
  h1: 'Heading 1',
  h2: 'Heading 2',
  h3: 'Heading 3',
  h4: 'Heading 4',
  bulleted: 'List',
  numbered: 'List',
  todo: 'To-do',
  toggle: 'Toggle',
  quote: 'Empty quote',
  callout: 'Type something…',
  code: '// Write some code',
}

/**
 * A small Notion editor: a flat list of blocks, "/" to insert or change a block,
 * markdown shortcuts, Enter to split, Backspace to merge, and a ⋮⋮ handle per block.
 */
export function DocEditor({ blocks, onChange, autoFocus, className }: Props) {
  const { readOnly } = useBoardEnv()
  const rootRef = useRef<HTMLDivElement>(null)
  const blocksRef = useRef(blocks)
  blocksRef.current = blocks
  const focusRequest = useRef<{ id: string; at: number | 'end' } | null>(autoFocus && blocks[0] ? { id: blocks[0].id, at: 'end' } : null)
  const [menu, setMenu] = useState<OpenMenu | null>(null)
  const [openToggles, setOpenToggles] = useState<Set<string>>(new Set())
  const [copied, setCopied] = useState<string | null>(null)

  const inputOf = (id: string) => rootRef.current?.querySelector<HTMLElement>(`[data-block="${id}"] .doc-input`) ?? null

  // Focus moves happen after React has rendered the blocks they point at.
  useLayoutEffect(() => {
    const request = focusRequest.current
    if (!request || readOnly) return
    const el = inputOf(request.id)
    if (!el) return
    focusRequest.current = null
    setCaret(el, request.at)
  })

  const commit = (next: DocBlock[]) => onChange(next.length ? next : [createDocBlock('text')])
  const focusLater = (id: string, at: number | 'end') => (focusRequest.current = { id, at })
  const patchBlock = (id: string, patch: Partial<DocBlock>) =>
    commit(blocksRef.current.map((b) => (b.id === id ? { ...b, ...patch } : b)))

  /** Inserts after `index`; a divider or emoji gets a Text block after it to keep typing in. */
  const insertAfter = (index: number, type: BlockType) => {
    const list = [...blocksRef.current]
    const created = createDocBlock(type)
    list.splice(index + 1, 0, created)
    if (!TEXTUAL.includes(type)) {
      const next = list[index + 2]
      if (!next || !TEXTUAL.includes(next.type)) {
        const text = createDocBlock('text')
        list.splice(index + 2, 0, text)
        focusLater(text.id, 0)
      } else focusLater(next.id, 0)
    } else focusLater(created.id, 0)
    commit(list)
  }

  const changeType = (id: string, type: BlockType) => {
    const index = blocksRef.current.findIndex((b) => b.id === id)
    if (index < 0) return
    const block = blocksRef.current[index]
    const list = blocksRef.current.map((b) => (b.id === id ? turnInto(b, type) : b))
    if (!TEXTUAL.includes(type) && !list[index + 1]) {
      const text = createDocBlock('text')
      list.push(text)
      focusLater(text.id, 0)
    } else if (TEXTUAL.includes(type)) {
      focusLater(block.id, 'end')
    }
    commit(list)
  }

  const onText = (block: DocBlock, value: string) => {
    if (block.type === 'text') {
      const shortcut = MARKDOWN_SHORTCUTS.find(([re]) => re.test(value))
      if (shortcut) {
        const [re, type] = shortcut
        const index = blocksRef.current.findIndex((b) => b.id === block.id)
        if (type === 'divider') {
          const list = [...blocksRef.current]
          const text = createDocBlock('text')
          list.splice(index, 1, { ...createDocBlock('divider'), id: block.id }, text)
          focusLater(text.id, 0)
          return commit(list)
        }
        focusLater(block.id, 0)
        return commit(blocksRef.current.map((b) => (b.id === block.id ? { ...turnInto(b, type), text: value.replace(re, '') } : b)))
      }
    }
    patchBlock(block.id, { text: value })
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>, block: DocBlock, index: number) => {
    const el = e.currentTarget
    const list = blocksRef.current
    const text = el.innerText.replace(/\n$/, '')
    const caret = getCaretOffset(el)
    const collapsed = window.getSelection()?.isCollapsed ?? true

    if (e.key === '/' && !e.metaKey && !e.ctrlKey && block.type !== 'code') {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      setMenu({ kind: 'slash', blockId: block.id, position: { x: rect.left, y: rect.bottom + 4, above: rect.top - 4 } })
      return
    }

    if (e.key === 'Tab' && block.type === 'code') {
      e.preventDefault()
      document.execCommand('insertText', false, '  ')
      return
    }

    if (e.key === 'Enter' && !e.shiftKey && block.type !== 'code') {
      e.preventDefault()
      // Enter on an empty list item ends the list, like Notion.
      if (CONTINUES.includes(block.type) && !text) {
        focusLater(block.id, 0)
        return commit(list.map((b) => (b.id === block.id ? turnInto(b, 'text') : b)))
      }
      const nextType = CONTINUES.includes(block.type) ? block.type : 'text'
      const created: DocBlock = { ...createDocBlock(nextType, text.slice(caret)), color: CONTINUES.includes(block.type) ? block.color : undefined }
      const next = [...list]
      next[index] = { ...block, text: text.slice(0, caret) }
      next.splice(index + 1, 0, created)
      focusLater(created.id, 0)
      return commit(next)
    }

    if (e.key === 'Backspace' && collapsed && caret === 0) {
      // First Backspace turns a styled block back into plain text; the next one merges upward.
      if (block.type !== 'text') {
        e.preventDefault()
        focusLater(block.id, 0)
        return commit(list.map((b) => (b.id === block.id ? turnInto(b, 'text') : b)))
      }
      if (index === 0) return
      e.preventDefault()
      const prev = list[index - 1]
      if (!TEXTUAL.includes(prev.type)) {
        focusLater(block.id, 0)
        return commit(list.filter((b) => b.id !== prev.id))
      }
      const prevText = prev.text ?? ''
      focusLater(prev.id, prevText.length)
      return commit(list.filter((b) => b.id !== block.id).map((b) => (b.id === prev.id ? { ...b, text: prevText + text } : b)))
    }

    const step = e.key === 'ArrowUp' && caret === 0 ? -1 : e.key === 'ArrowDown' && caret >= text.length ? 1 : 0
    if (step) {
      let j = index + step
      while (list[j] && !TEXTUAL.includes(list[j].type)) j += step
      const target = list[j] && inputOf(list[j].id)
      if (target) {
        e.preventDefault()
        setCaret(target, step < 0 ? 'end' : 0)
      }
    }
  }

  const menuBlock = menu ? blocks.find((b) => b.id === menu.blockId) : undefined
  let number = 0

  return (
    <div ref={rootRef} className={`doc${blocks.length === 1 ? ' doc-single' : ''} ${className ?? ''}`}>
      {blocks.map((block, index) => {
        number = block.type === 'numbered' ? number + 1 : 0
        const style: CSSProperties = {}
        if (block.color && block.color !== 'default') style.color = TEXT_COLOR[block.color]
        if (block.background && block.background !== 'default') style.background = BG_COLOR[block.background]
        const open = openToggles.has(block.id)

        const input = (
          <EditableText
            className={`doc-input doc-input-${block.type}`}
            value={block.text ?? ''}
            readOnly={readOnly}
            placeholder={PLACEHOLDER[block.type]}
            onChange={(value) => onText(block, value)}
            onKeyDown={(e) => onKeyDown(e, block, index)}
          />
        )

        let content
        switch (block.type) {
          case 'divider':
            content = <hr className="doc-hr" />
            break
          case 'emoji':
            content = (
              <button
                className="doc-emoji-btn"
                disabled={readOnly}
                onClick={(e) => setMenu({ kind: 'emoji', blockId: block.id, position: anchorFrom(e) })}
              >
                {block.icon}
              </button>
            )
            break
          case 'bulleted':
            content = (
              <>
                <span className="doc-marker">
                  <span className="bullet" />
                </span>
                {input}
              </>
            )
            break
          case 'numbered':
            content = (
              <>
                <span className="doc-marker doc-number">{number}.</span>
                {input}
              </>
            )
            break
          case 'todo':
            content = (
              <>
                <span className="doc-marker">
                  <button
                    className={`checkbox${block.checked ? ' checked' : ''}`}
                    disabled={readOnly}
                    onClick={() => patchBlock(block.id, { checked: !block.checked })}
                    aria-label={block.checked ? 'Mark as not done' : 'Mark as done'}
                  >
                    {block.checked && <Check size={12} strokeWidth={3} />}
                  </button>
                </span>
                {input}
              </>
            )
            break
          case 'toggle':
            content = (
              <>
                <span className="doc-marker">
                  <button
                    className={`toggle-btn${open ? ' open' : ''}`}
                    onClick={() =>
                      setOpenToggles((set) => {
                        const next = new Set(set)
                        if (next.has(block.id)) next.delete(block.id)
                        else next.add(block.id)
                        return next
                      })
                    }
                    aria-label="Toggle"
                  >
                    <ChevronRight size={14} />
                  </button>
                </span>
                <div className="doc-toggle-main">
                  {input}
                  {open && (!readOnly || block.body) && (
                    <EditableText
                      className="doc-toggle-body"
                      value={block.body ?? ''}
                      readOnly={readOnly}
                      placeholder="Empty toggle. Click to add content."
                      onChange={(body) => patchBlock(block.id, { body })}
                    />
                  )}
                </div>
              </>
            )
            break
          case 'callout':
            content = (
              <>
                <button
                  className="callout-icon"
                  disabled={readOnly}
                  onClick={(e) => setMenu({ kind: 'emoji', blockId: block.id, position: anchorFrom(e) })}
                >
                  {block.icon}
                </button>
                {input}
              </>
            )
            break
          case 'code':
            content = (
              <div className="doc-code-box">
                <div className="code-head">
                  {readOnly ? (
                    <span className="code-lang">{block.language}</span>
                  ) : (
                    <select className="code-lang" value={block.language} onChange={(e) => patchBlock(block.id, { language: e.target.value })}>
                      {CODE_LANGUAGES.map((l) => (
                        <option key={l}>{l}</option>
                      ))}
                    </select>
                  )}
                  <button
                    className="code-copy"
                    onClick={() => {
                      navigator.clipboard?.writeText(block.text ?? '')
                      setCopied(block.id)
                      setTimeout(() => setCopied(null), 1200)
                    }}
                  >
                    {copied === block.id ? <Check size={13} /> : <Copy size={13} />}
                    {copied === block.id ? 'Copied' : 'Copy'}
                  </button>
                </div>
                {input}
              </div>
            )
            break
          default:
            content = input
        }

        return (
          <div key={block.id} data-block={block.id} className={`doc-block doc-${block.type}${block.checked ? ' done' : ''}`} style={style}>
            {!readOnly && (
              <button
                className="doc-handle"
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => setMenu({ kind: 'handle', blockId: block.id, position: anchorFrom(e) })}
                aria-label="Block options"
              >
                <GripVertical size={14} />
              </button>
            )}
            {content}
          </div>
        )
      })}

      {menu?.kind === 'slash' && (
        <CommandMenu
          position={menu.position}
          options={BLOCK_OPTIONS}
          placeholder="Search blocks…"
          onClose={() => {
            setMenu(null)
            focusLater(menu.blockId, 'end')
          }}
          onPick={(type) => {
            const index = blocksRef.current.findIndex((b) => b.id === menu.blockId)
            const block = blocksRef.current[index]
            if (!block) return
            // An empty line becomes the block; otherwise the block goes below it.
            if ((block.text ?? '').trim()) insertAfter(index, type)
            else changeType(block.id, type)
          }}
        />
      )}

      {menu?.kind === 'turn' && (
        <CommandMenu
          position={menu.position}
          options={BLOCK_OPTIONS}
          placeholder="Turn into…"
          onClose={() => setMenu(null)}
          onPick={(type) => changeType(menu.blockId, type)}
        />
      )}

      {menu?.kind === 'handle' && menuBlock && (
        <Menu
          position={menu.position}
          onClose={() => setMenu((m) => (m?.kind === 'handle' ? null : m))}
          entries={[
            { label: 'Turn into…', icon: <Repeat2 size={15} />, onSelect: () => setMenu({ ...menu, kind: 'turn' }) },
            { label: 'Color…', icon: <Palette size={15} />, onSelect: () => setMenu({ ...menu, kind: 'color' }) },
            {
              label: 'Duplicate',
              icon: <CopyPlus size={15} />,
              onSelect: () => {
                const list = [...blocksRef.current]
                const index = list.findIndex((b) => b.id === menuBlock.id)
                list.splice(index + 1, 0, { ...structuredClone(menuBlock), id: crypto.randomUUID() })
                commit(list)
              },
            },
            'separator',
            {
              label: 'Delete',
              icon: <Trash2 size={15} />,
              danger: true,
              onSelect: () => commit(blocksRef.current.filter((b) => b.id !== menuBlock.id)),
            },
          ]}
        />
      )}

      {menu?.kind === 'color' && menuBlock && (
        <ColorMenu
          position={menu.position}
          color={menuBlock.color ?? 'default'}
          background={menuBlock.background ?? 'default'}
          onChange={(patch) => patchBlock(menuBlock.id, patch)}
          onClose={() => setMenu(null)}
        />
      )}

      {menu?.kind === 'emoji' && (
        <EmojiPicker position={menu.position} onSelect={(icon) => patchBlock(menu.blockId, { icon })} onClose={() => setMenu(null)} />
      )}
    </div>
  )
}
