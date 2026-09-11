import { useState } from 'react'
import { RotateCcw, Trash2, X } from 'lucide-react'
import { BoardThumbnail } from '../components/BoardThumbnail'
import { CardContent } from '../components/cards/CardContent'
import { Dialog } from '../components/Dialog'
import { useToast } from '../hooks/useToasts'
import { TRASH_DAYS, useWorkspace } from '../hooks/useWorkspace'
import { BoardEnvContext, type BoardEnv } from '../lib/boardEnv'
import { href, navigate } from '../lib/router'
import { getBlobUrl } from '../lib/storage'
import { timeAgo } from '../lib/time'

const readOnlyEnv: BoardEnv = { readOnly: true, blobUrl: getBlobUrl }
const DAY = 24 * 60 * 60 * 1000

const daysLeft = (deletedAt: number) => Math.max(0, Math.ceil((deletedAt + TRASH_DAYS * DAY - Date.now()) / DAY))
const noop = () => {}

type Confirm = { kind: 'empty' } | { kind: 'board'; id: string; name: string } | { kind: 'card'; id: string }

export function TrashPage() {
  const ws = useWorkspace()
  const toast = useToast()
  const [confirm, setConfirm] = useState<Confirm | null>(null)
  const boards = ws.boards.filter((b) => b.deletedAt).sort((a, b) => b.deletedAt! - a.deletedAt!)
  const cards = ws.trash
  const empty = !boards.length && !cards.length

  return (
    <main className="dash trash-page">
      <header className="dash-head">
        <div className="dash-title">
          <h1>Trash</h1>
        </div>
        {!empty && (
          <button className="btn btn-ghost" onClick={() => setConfirm({ kind: 'empty' })}>
            <Trash2 size={15} /> Empty Trash
          </button>
        )}
      </header>
      <p className="page-note">Deleted boards and cards stay here for {TRASH_DAYS} days, then they’re gone for good.</p>

      {empty && (
        <div className="dash-empty">
          <Trash2 size={28} strokeWidth={1.5} />
          <h2>Trash is empty</h2>
          <p>Nothing deleted in the last {TRASH_DAYS} days.</p>
        </div>
      )}

      {boards.length > 0 && (
        <section>
          <h2 className="section-title">Boards</h2>
          <div className="tiles">
            {boards.map((board) => (
              <div key={board.id} className="tile trashed">
                <BoardThumbnail board={board} />
                <div className="tile-info">
                  <div className="tile-text">
                    <div className="tile-name">{board.name}</div>
                    <div className="tile-meta">
                      Deleted {timeAgo(board.deletedAt!)} · {daysLeft(board.deletedAt!)} days left
                    </div>
                  </div>
                </div>
                <div className="trash-actions">
                  <button
                    className="btn"
                    onClick={() => {
                      ws.restoreBoard(board.id)
                      toast({ title: `“${board.name}” restored`, action: { label: 'Open', onClick: () => navigate(href.board(board.id)) } })
                    }}
                  >
                    <RotateCcw size={14} /> Restore
                  </button>
                  <button className="icon-btn" onClick={() => setConfirm({ kind: 'board', id: board.id, name: board.name })} title="Delete forever">
                    <X size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {cards.length > 0 && (
        <section>
          <h2 className="section-title">Cards</h2>
          <BoardEnvContext.Provider value={readOnlyEnv}>
            <div className="trash-cards">
              {cards.map((entry) => (
                <div key={entry.item.id} className="trash-card">
                  <div className={`card size-S kind-${entry.item.kind}${entry.item.kind === 'widget' ? ` widget-${entry.item.widget}` : ''}`}>
                    <div className="card-body">
                      <CardContent item={entry.item} onUpdate={noop} />
                    </div>
                  </div>
                  <div className="tile-text">
                    <div className="tile-name">{entry.item.caption || `From ${entry.boardName}`}</div>
                    <div className="tile-meta">
                      {timeAgo(entry.deletedAt)} · {daysLeft(entry.deletedAt)} days left
                    </div>
                  </div>
                  <div className="trash-actions">
                    <button
                      className="btn"
                      onClick={async () => {
                        const board = await ws.restoreCard(entry.item.id)
                        if (board) toast({ title: `Restored to “${board.name}”`, action: { label: 'Open', onClick: () => navigate(href.board(board.id)) } })
                      }}
                    >
                      <RotateCcw size={14} /> Restore
                    </button>
                    <button className="icon-btn" onClick={() => setConfirm({ kind: 'card', id: entry.item.id })} title="Delete forever">
                      <X size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </BoardEnvContext.Provider>
        </section>
      )}

      {confirm && (
        <Dialog
          title={confirm.kind === 'empty' ? 'Empty Trash?' : 'Delete forever?'}
          confirmLabel={confirm.kind === 'empty' ? 'Empty Trash' : 'Delete forever'}
          danger
          onConfirm={() => {
            if (confirm.kind === 'empty') ws.emptyTrash()
            else if (confirm.kind === 'board') ws.purgeBoard(confirm.id)
            else ws.deleteCardForever(confirm.id)
          }}
          onClose={() => setConfirm(null)}
        >
          <p className="dialog-text">
            {confirm.kind === 'empty'
              ? `${boards.length + cards.length} items will be deleted permanently. This can’t be undone.`
              : confirm.kind === 'board'
                ? `“${confirm.name}” and everything on it will be deleted permanently.`
                : 'This card will be deleted permanently.'}
          </p>
        </Dialog>
      )}
    </main>
  )
}
