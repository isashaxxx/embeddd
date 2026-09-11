import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, Eye, Globe } from 'lucide-react'
import { Board } from '../components/Board'
import { BoardThumbnail } from '../components/BoardThumbnail'
import { BoardEnvContext, type BoardEnv } from '../lib/boardEnv'
import { fetchShare, sharedBlobUrl } from '../lib/share'
import { href } from '../lib/router'
import { timeAgo } from '../lib/time'
import type { BoardMeta, ShareManifest } from '../types'

const POLL_MS = 20_000
const noop = () => {}

/** Public, view-only page behind a share link. Polls so the owner's edits show up. */
export function SharedView({ token, boardId }: { token: string; boardId?: string }) {
  const [manifest, setManifest] = useState<ShareManifest | null | undefined>(undefined)

  useEffect(() => {
    let alive = true
    const load = () =>
      fetchShare(token)
        .then((m) => {
          if (!alive) return
          // Only swap state on a new publish, so playing videos don't restart.
          setManifest((prev) => (prev && m && prev.publishedAt === m.publishedAt ? prev : m))
        })
        .catch(() => alive && setManifest((prev) => prev ?? null))
    load()
    const timer = setInterval(load, POLL_MS)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [token])

  const blobUrls = manifest?.blobUrls
  const env = useMemo<BoardEnv>(() => ({ readOnly: true, blobUrl: (id) => blobUrls?.[id] ?? sharedBlobUrl(token, id) }), [token, blobUrls])

  useEffect(() => {
    if (manifest) document.title = `${manifest.name} — embeddd`
  }, [manifest])

  if (manifest === undefined) return <div className="shared-state">Loading…</div>
  if (manifest === null) {
    return (
      <div className="shared-state">
        <h2>This link isn’t available</h2>
        <p>The owner may have turned off sharing.</p>
      </div>
    )
  }

  // A board share opens straight into its board; a project share lists boards first.
  const board = manifest.scope === 'board' ? manifest.boards[0] : manifest.boards.find((b) => b.id === boardId)
  const published = `Updated ${timeAgo(manifest.publishedAt)}`

  return (
    <BoardEnvContext.Provider value={env}>
      {board ? (
        <>
          <header className="board-bar">
            {manifest.scope === 'project' && (
              <a className="icon-btn bar-back" href={href.shared(token)} aria-label="Back to project">
                <ChevronLeft size={20} />
              </a>
            )}
            <nav className="crumbs">
              {manifest.scope === 'project' && (
                <>
                  <a href={href.shared(token)}>{manifest.name}</a>
                  <span className="crumb-sep">/</span>
                </>
              )}
              <span className="shared-title">{board.name}</span>
            </nav>
            <div className="bar-right">
              <span className="count">{published}</span>
              <span className="view-only">
                <Eye size={14} /> View only
              </span>
            </div>
          </header>
          <main className="board-wrap" data-cols={board.columns ?? 4}>
            <Board items={board.items} columns={board.columns ?? 4} focusId={null} onUpdate={noop} onRemove={noop} onMove={noop} />
          </main>
        </>
      ) : (
        <main className="shared-project">
          <header className="dash-head">
            <div className="dash-title">
              <h1>{manifest.name}</h1>
            </div>
            <span className="view-only">
              <Globe size={14} /> Shared project · {manifest.boards.length} {manifest.boards.length === 1 ? 'board' : 'boards'}
            </span>
          </header>
          <div className="tiles">
            {manifest.boards.map((b) => {
              const meta: BoardMeta = { id: b.id, name: b.name, projectId: null, createdAt: b.updatedAt, updatedAt: b.updatedAt, columns: b.columns }
              return (
                <div key={b.id} className="tile">
                  <a className="tile-link" href={href.shared(token, b.id)} draggable={false}>
                    <BoardThumbnail board={meta} items={b.items} />
                  </a>
                  <div className="tile-info">
                    <div className="tile-text">
                      <div className="tile-name">{b.name}</div>
                      <div className="tile-meta">Edited {timeAgo(b.updatedAt)}</div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          {!manifest.boards.length && <div className="dash-empty">This project has no boards yet.</div>}
        </main>
      )}
    </BoardEnvContext.Provider>
  )
}
