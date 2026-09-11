import { useEffect, useState } from 'react'
import { ArrowDownUp, Check, FileText, Folder, Globe, MoreHorizontal, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { BoardTile } from '../components/BoardTile'
import { Dialog } from '../components/Dialog'
import { Menu, menuPositionFrom, type MenuEntry, type MenuPosition } from '../components/Menu'
import { ShareDialog } from '../components/ShareDialog'
import { useWorkspace } from '../hooks/useWorkspace'
import { href, navigate, type Route } from '../lib/router'
import type { BoardMeta } from '../types'

type Sort = 'updated' | 'name' | 'created'

const SORT_LABEL: Record<Sort, string> = {
  updated: 'Last modified',
  name: 'Alphabetical',
  created: 'Date created',
}

const SORTERS: Record<Sort, (a: BoardMeta, b: BoardMeta) => number> = {
  updated: (a, b) => b.updatedAt - a.updatedAt,
  name: (a, b) => a.name.localeCompare(b.name),
  created: (a, b) => b.createdAt - a.createdAt,
}

function readSort(): Sort {
  try {
    const value = localStorage.getItem('embeddd:sort')
    return value && value in SORT_LABEL ? (value as Sort) : 'updated'
  } catch {
    return 'updated'
  }
}

interface Props {
  route: Route
  /** Sidebar search; when set, the page shows matches across every project. */
  query: string
}

export function Dashboard({ route, query }: Props) {
  const ws = useWorkspace()
  const [sort, setSort] = useState<Sort>(readSort)
  const [menu, setMenu] = useState<{ kind: 'sort' | 'project'; position: MenuPosition } | null>(null)
  const [dialog, setDialog] = useState<'rename' | 'delete' | 'share' | null>(null)

  const project = route.name === 'project' ? ws.projects.find((p) => p.id === route.id) : undefined

  useEffect(() => {
    if (route.name === 'project' && !project) navigate(href.recent())
  }, [route.name, project])

  const q = query.trim().toLowerCase()
  let title: string
  let boards: BoardMeta[]
  if (q) {
    title = 'Search results'
    boards = ws.activeBoards.filter((b) => b.name.toLowerCase().includes(q)).sort(SORTERS[sort])
  } else if (route.name === 'recent') {
    title = 'Recents'
    boards = [...ws.activeBoards].sort((a, b) => Math.max(b.openedAt ?? 0, b.updatedAt) - Math.max(a.openedAt ?? 0, a.updatedAt))
  } else if (route.name === 'drafts') {
    title = 'Drafts'
    boards = ws.activeBoards.filter((b) => b.projectId === null).sort(SORTERS[sort])
  } else {
    title = project?.name ?? ''
    boards = ws.activeBoards.filter((b) => b.projectId === project?.id).sort(SORTERS[sort])
  }

  const createBoard = () => navigate(href.board(ws.createBoard(project?.id ?? null).id))

  const sortEntries: MenuEntry[] = (Object.keys(SORT_LABEL) as Sort[]).map((key) => ({
    label: SORT_LABEL[key],
    icon: key === sort ? <Check size={15} /> : <span className="menu-icon-space" />,
    onSelect: () => {
      setSort(key)
      try {
        localStorage.setItem('embeddd:sort', key)
      } catch {
        // sorting preference is optional
      }
    },
  }))

  const projectEntries: MenuEntry[] = [
    { label: 'New board', icon: <Plus size={15} />, onSelect: createBoard },
    { label: 'Rename', icon: <Pencil size={15} />, onSelect: () => setDialog('rename') },
    { label: 'Share…', icon: <Globe size={15} />, onSelect: () => setDialog('share') },
    'separator',
    { label: 'Delete project', icon: <Trash2 size={15} />, danger: true, onSelect: () => setDialog('delete') },
  ]

  const showSort = !!q || route.name !== 'recent'
  const projectShared = !!project && ws.shares.some((r) => r.scope === 'project' && r.targetId === project.id)
  const EmptyIcon = q ? Search : route.name === 'project' ? Folder : FileText

  return (
    <>
      <main className="dash">
        <header className="dash-head">
          <div className="dash-title">
            <h1>{title}</h1>
            {project && !q && (
              <button
                className="icon-btn"
                onClick={(e) => setMenu({ kind: 'project', position: menuPositionFrom(e) })}
                aria-label="Project actions"
              >
                <MoreHorizontal size={18} />
              </button>
            )}
          </div>
          <div className="dash-actions">
            {showSort && (
              <button className="btn btn-ghost" onClick={(e) => setMenu({ kind: 'sort', position: menuPositionFrom(e) })}>
                <ArrowDownUp size={15} />
                {SORT_LABEL[sort]}
              </button>
            )}
            {project && !q && (
              <button className={`btn btn-share${projectShared ? ' shared' : ''}`} onClick={() => setDialog('share')}>
                {projectShared && <Globe size={14} />}
                {projectShared ? 'Shared' : 'Share'}
              </button>
            )}
            <button className="btn btn-primary" onClick={createBoard}>
              <Plus size={16} />
              New board
            </button>
          </div>
        </header>

        {boards.length ? (
          <div className="tiles">
            {boards.map((board) => (
              <BoardTile key={board.id} board={board} showLocation={route.name === 'recent' || !!q} />
            ))}
          </div>
        ) : (
          <div className="dash-empty">
            <EmptyIcon size={28} strokeWidth={1.5} />
            <h2>{q ? `Nothing matches “${query.trim()}”` : route.name === 'project' ? 'This project is empty' : 'No boards yet'}</h2>
            <p>
              {q
                ? 'Try a different name.'
                : route.name === 'project'
                  ? 'Create a board here, or drag boards onto the project in the sidebar.'
                  : 'Create a board to start collecting links, photos and videos.'}
            </p>
            {!q && (
              <button className="btn btn-primary" onClick={createBoard}>
                <Plus size={16} />
                New board
              </button>
            )}
          </div>
        )}
      </main>

      {menu && (
        <Menu
          position={menu.position}
          entries={menu.kind === 'sort' ? sortEntries : projectEntries}
          onClose={() => setMenu(null)}
        />
      )}

      {project && dialog === 'share' && (
        <ShareDialog scope="project" targetId={project.id} name={project.name} onClose={() => setDialog(null)} />
      )}
      {project && dialog === 'rename' && (
        <Dialog
          title="Rename project"
          confirmLabel="Rename"
          input={{ defaultValue: project.name }}
          onConfirm={(name) => ws.renameProject(project.id, name)}
          onClose={() => setDialog(null)}
        />
      )}
      {project && dialog === 'delete' && (
        <Dialog
          title="Delete project?"
          confirmLabel="Delete project"
          danger
          onConfirm={() => {
            ws.deleteProject(project.id)
            navigate(href.recent())
          }}
          onClose={() => setDialog(null)}
        >
          <p className="dialog-text">
            “{project.name}” will be removed and its {boards.length} {boards.length === 1 ? 'board goes' : 'boards go'} to Trash, where
            you can restore them for 30 days.
          </p>
        </Dialog>
      )}
    </>
  )
}
