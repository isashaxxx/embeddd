import { useState } from 'react'
import { Globe, MoreHorizontal } from 'lucide-react'
import { useBoardActions } from '../hooks/useBoardActions'
import { useWorkspace } from '../hooks/useWorkspace'
import { href } from '../lib/router'
import { timeAgo } from '../lib/time'
import type { BoardMeta } from '../types'
import { BoardThumbnail } from './BoardThumbnail'
import { Menu, menuPositionFrom, type MenuPosition } from './Menu'

export const BOARD_DRAG_TYPE = 'application/x-embeddd-board'

interface Props {
  board: BoardMeta
  /** Recents and search mix projects, so the tile says where the board lives. */
  showLocation: boolean
}

export function BoardTile({ board, showLocation }: Props) {
  const ws = useWorkspace()
  const [menu, setMenu] = useState<MenuPosition | null>(null)
  const [renaming, setRenaming] = useState(false)
  const { entries, dialogs } = useBoardActions(board, { onRename: () => setRenaming(true) })
  const shared = ws.shares.some(
    (r) => (r.scope === 'board' && r.targetId === board.id) || (r.scope === 'project' && r.targetId === board.projectId),
  )
  const location = board.projectId ? ws.projects.find((p) => p.id === board.projectId)?.name : 'Drafts'

  const openMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setMenu(menuPositionFrom(e))
  }

  const commitRename = (value: string) => {
    ws.renameBoard(board.id, value)
    setRenaming(false)
  }

  return (
    <div
      className={`tile${menu ? ' menu-open' : ''}`}
      draggable={!renaming}
      onDragStart={(e) => {
        e.dataTransfer.setData(BOARD_DRAG_TYPE, board.id)
        e.dataTransfer.effectAllowed = 'move'
      }}
      onContextMenu={openMenu}
    >
      <a className="tile-link" href={href.board(board.id)} draggable={false} aria-label={`Open ${board.name}`}>
        <BoardThumbnail board={board} />
      </a>

      <div className="tile-info">
        <div className="tile-text">
          {renaming ? (
            <input
              className="tile-rename"
              defaultValue={board.name}
              autoFocus
              onFocus={(e) => e.currentTarget.select()}
              onBlur={(e) => commitRename(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename(e.currentTarget.value)
                if (e.key === 'Escape') setRenaming(false)
              }}
            />
          ) : (
            <div className="tile-name" onDoubleClick={() => setRenaming(true)} title={board.name}>
              {board.name}
            </div>
          )}
          <div className="tile-meta">
            {shared && <Globe size={11} className="tile-shared" aria-label="Shared publicly" />}
            {showLocation && location ? `${location} · ` : ''}Edited {timeAgo(board.updatedAt)}
          </div>
        </div>
        <button className="icon-btn tile-more" onClick={openMenu} aria-label="Board actions">
          <MoreHorizontal size={18} />
        </button>
      </div>

      {menu && <Menu position={menu} entries={entries} onClose={() => setMenu(null)} />}
      {dialogs}
    </div>
  )
}
