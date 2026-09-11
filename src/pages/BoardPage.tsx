import { useEffect, useState } from 'react'
import { Globe, LayoutGrid, MoreHorizontal } from 'lucide-react'
import { Board } from '../components/Board'
import { CARD_DRAG_TYPE } from '../components/Card'
import { Composer } from '../components/Composer'
import { Menu, menuPositionFrom, type MenuPosition } from '../components/Menu'
import { useBoard } from '../hooks/useBoard'
import { useBoardActions } from '../hooks/useBoardActions'
import { useWorkspace } from '../hooks/useWorkspace'
import { normalizeUrl } from '../lib/platforms'
import { href, navigate } from '../lib/router'
import type { Counter } from '../lib/achievements'
import type { BoardMeta, Columns, Item } from '../types'

const COLUMN_OPTIONS: Columns[] = [4, 6, 8]

export const PENDING_LINK_KEY = 'embeddd:pending-link'

const COUNTER_FOR: Record<Item['kind'], Counter> = {
  text: 'texts',
  image: 'photos',
  video: 'videos',
  file: 'files',
  link: 'links',
  widget: 'widgets',
  sketch: 'sketches',
}

function isEditableTarget(target: EventTarget | null) {
  const el = target as HTMLElement | null
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
}

export function BoardPage({ boardId }: { boardId: string }) {
  const ws = useWorkspace()
  const meta = ws.boards.find((b) => b.id === boardId)

  useEffect(() => {
    if (!meta) navigate(href.recent())
    else if (meta.deletedAt) navigate(href.trash())
  }, [meta])

  return meta && !meta.deletedAt ? <BoardView meta={meta} /> : null
}

function BoardView({ meta }: { meta: BoardMeta }) {
  const ws = useWorkspace()
  const { patchBoard, trashCard, track } = ws
  const board = useBoard(meta.id, {
    onChange: () => patchBoard(meta.id, { updatedAt: Date.now() }),
    onTrash: (item, index) => trashCard(meta.id, item, index),
    onAdded: (item) => {
      track('cards')
      track(COUNTER_FOR[item.kind])
    },
  })
  const { addFiles, addLink } = board
  const [focusId, setFocusId] = useState<string | null>(null)
  const [drawId, setDrawId] = useState<string | null>(null)
  const columns = meta.columns ?? 4
  const [dropping, setDropping] = useState(false)
  const [menu, setMenu] = useState<MenuPosition | null>(null)
  const [name, setName] = useState(meta.name)
  const project = meta.projectId ? ws.projects.find((p) => p.id === meta.projectId) : undefined
  const back = href.project(meta.projectId)
  const { entries, dialogs, openShare } = useBoardActions(meta, { isOpen: true, onDeleted: () => navigate(back) })
  const isShared = ws.shares.some((r) => r.scope === 'board' && r.targetId === meta.id)

  useEffect(() => {
    patchBoard(meta.id, { openedAt: Date.now() })
  }, [meta.id, patchBoard])

  useEffect(() => setName(meta.name), [meta.name])

  // A link pasted into the landing page's search bar lands on this new board.
  useEffect(() => {
    // Wait for the board to load, or the stored items would overwrite the new card.
    const pending = board.loaded && sessionStorage.getItem(PENDING_LINK_KEY)
    if (!pending) return
    sessionStorage.removeItem(PENDING_LINK_KEY)
    addLink(pending)
  }, [addLink, board.loaded])

  useEffect(() => {
    document.title = `${meta.name} — embeddd`
    return () => {
      document.title = 'embeddd'
    }
  }, [meta.name])

  // Paste a link or an image anywhere on the page.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (isEditableTarget(e.target)) return
      const files = Array.from(e.clipboardData?.files ?? [])
      if (files.length) return void addFiles(files)
      const url = normalizeUrl(e.clipboardData?.getData('text') ?? '')
      if (url) addLink(url)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [addFiles, addLink])

  // Drop files or links from other tabs onto the page.
  useEffect(() => {
    const isExternal = (e: DragEvent) => {
      const types = e.dataTransfer?.types ?? []
      return !types.includes(CARD_DRAG_TYPE) && (types.includes('Files') || types.includes('text/uri-list'))
    }
    const onOver = (e: DragEvent) => {
      if (!isExternal(e)) return
      e.preventDefault()
      setDropping(true)
    }
    const onLeave = (e: DragEvent) => {
      if (!e.relatedTarget) setDropping(false)
    }
    const onDrop = (e: DragEvent) => {
      setDropping(false)
      if (!isExternal(e)) return
      e.preventDefault()
      const files = Array.from(e.dataTransfer?.files ?? [])
      if (files.length) return void addFiles(files)
      const url = normalizeUrl(e.dataTransfer?.getData('text/uri-list').split('\n')[0] ?? '')
      if (url) addLink(url)
    }
    window.addEventListener('dragover', onOver)
    window.addEventListener('dragleave', onLeave)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragover', onOver)
      window.removeEventListener('dragleave', onLeave)
      window.removeEventListener('drop', onDrop)
    }
  }, [addFiles, addLink])

  const commitName = (value: string) => {
    if (value.trim() && value.trim() !== meta.name) ws.renameBoard(meta.id, value)
    else setName(meta.name)
  }

  return (
    <>
      <header className="board-bar" data-cols={columns}>
        <nav className="crumbs">
          <a href={back}>{project?.name ?? 'Drafts'}</a>
          <span className="crumb-sep">/</span>
          <input
            className="title-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={(e) => commitName(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur()
              if (e.key === 'Escape') {
                e.currentTarget.value = meta.name
                setName(meta.name)
                e.currentTarget.blur()
              }
            }}
            aria-label="Board name"
            spellCheck={false}
          />
        </nav>
        <div className="bar-right">
          {board.loaded && board.items.length > 0 && (
            <span className="count">
              {board.items.length} {board.items.length === 1 ? 'item' : 'items'}
            </span>
          )}
          <div className="segmented columns-switch" title="Columns">
            <LayoutGrid size={14} />
            {COLUMN_OPTIONS.map((c) => (
              <button key={c} className={c === columns ? 'active' : ''} onClick={() => patchBoard(meta.id, { columns: c, updatedAt: Date.now() })}>
                {c}
              </button>
            ))}
          </div>
          <button className={`btn btn-share${isShared ? ' shared' : ''}`} onClick={openShare}>
            {isShared && <Globe size={14} />}
            {isShared ? 'Shared' : 'Share'}
          </button>
          <button className="icon-btn" onClick={(e) => setMenu(menuPositionFrom(e))} aria-label="Board actions">
            <MoreHorizontal size={18} />
          </button>
        </div>
      </header>

      <div className="board-wrap" data-cols={columns}>
        {board.loaded && (
          <Board
            items={board.items}
            columns={columns}
            focusId={focusId}
            drawId={drawId}
            onUpdate={board.update}
            onRemove={board.remove}
            onMove={board.move}
            onTagged={() => track('tagged')}
            onDescribed={() => track('described')}
          />
        )}
      </div>

      <Composer
        onLink={addLink}
        onFiles={addFiles}
        onText={() => setFocusId(board.addText())}
        onSketch={() => setDrawId(board.addSketch())}
        onWidget={(widget) => board.addWidget(widget)}
      />

      {dropping && <div className="drop-overlay">Drop to add to board</div>}
      {menu && <Menu position={menu} entries={entries} onClose={() => setMenu(null)} />}
      {dialogs}
    </>
  )
}
