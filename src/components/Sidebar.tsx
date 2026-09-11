import { useState, type ReactNode } from 'react'
import { Clock, FileText, Folder, Plus, Search, Trash2, Trophy, X } from 'lucide-react'
import { useAchievements } from '../hooks/useAchievements'
import { ACHIEVEMENTS } from '../lib/achievements'
import { useWorkspace } from '../hooks/useWorkspace'
import { href, navigate, type Route } from '../lib/router'
import { BOARD_DRAG_TYPE } from './BoardTile'
import { Dialog } from './Dialog'

interface Props {
  route: Route
  query: string
  onQuery: (q: string) => void
}

function NavLink({
  to,
  active,
  icon,
  children,
  onDropBoard,
  count,
}: {
  to: string
  active: boolean
  icon: ReactNode
  children: ReactNode
  onDropBoard?: (boardId: string) => void
  count?: ReactNode
}) {
  const [over, setOver] = useState(false)
  const accepts = (e: React.DragEvent) => !!onDropBoard && e.dataTransfer.types.includes(BOARD_DRAG_TYPE)

  return (
    <a
      href={to}
      className={`nav-link${active ? ' active' : ''}${over ? ' drop-over' : ''}`}
      draggable={false}
      onDragOver={(e) => {
        if (!accepts(e)) return
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        setOver(false)
        if (!accepts(e)) return
        e.preventDefault()
        onDropBoard?.(e.dataTransfer.getData(BOARD_DRAG_TYPE))
      }}
    >
      {icon}
      <span className="nav-label">{children}</span>
      {count !== undefined && <span className="nav-count">{count}</span>}
    </a>
  )
}

export function Sidebar({ route, query, onQuery }: Props) {
  const ws = useWorkspace()
  const { state } = useAchievements()
  const [creating, setCreating] = useState(false)
  const searching = !!query
  // On a board, its project (or Drafts) stays highlighted, like a folder in Finder.
  const boardProject = route.name === 'board' ? ws.boards.find((b) => b.id === route.id)?.projectId : undefined
  const trashCount = ws.trash.length + ws.boards.filter((b) => b.deletedAt).length
  const unlocked = state ? Object.keys(state.unlocked).length : 0

  return (
    <aside className="sidebar">
      <a className="logo sidebar-logo" href={href.recent()}>
        embeddd
      </a>

      <label className="search">
        <Search size={15} />
        <input value={query} onChange={(e) => onQuery(e.target.value)} placeholder="Search boards" />
        {query && (
          <button className="icon-btn" onClick={() => onQuery('')} aria-label="Clear search">
            <X size={14} />
          </button>
        )}
      </label>

      <nav className="nav">
        <NavLink to={href.recent()} active={!searching && route.name === 'recent'} icon={<Clock size={16} />}>
          Recents
        </NavLink>
        <NavLink
          to={href.drafts()}
          active={!searching && (route.name === 'drafts' || boardProject === null)}
          icon={<FileText size={16} />}
          onDropBoard={(id) => ws.moveBoard(id, null)}
        >
          Drafts
        </NavLink>
      </nav>

      <div className="nav-section">
        <span>Projects</span>
        <button className="icon-btn" onClick={() => setCreating(true)} aria-label="New project" title="New project">
          <Plus size={16} />
        </button>
      </div>

      <nav className="nav projects-nav">
        {ws.projects.map((p) => (
          <NavLink
            key={p.id}
            to={href.project(p.id)}
            active={!searching && ((route.name === 'project' && route.id === p.id) || boardProject === p.id)}
            icon={<Folder size={16} />}
            onDropBoard={(id) => ws.moveBoard(id, p.id)}
          >
            {p.name}
          </NavLink>
        ))}
        {!ws.projects.length && (
          <button className="nav-link nav-ghost" onClick={() => setCreating(true)}>
            <Plus size={16} />
            <span className="nav-label">New project</span>
          </button>
        )}
      </nav>

      <nav className="nav nav-bottom">
        <NavLink
          to={href.achievements()}
          active={!searching && route.name === 'achievements'}
          icon={<Trophy size={16} />}
          count={`${unlocked}/${ACHIEVEMENTS.length}`}
        >
          Achievements
        </NavLink>
        <NavLink
          to={href.trash()}
          active={!searching && route.name === 'trash'}
          icon={<Trash2 size={16} />}
          count={trashCount || undefined}
          onDropBoard={(id) => ws.trashBoard(id)}
        >
          Trash
        </NavLink>
      </nav>

      {creating && (
        <Dialog
          title="Create project"
          confirmLabel="Create project"
          input={{ placeholder: 'Project name' }}
          onConfirm={(name) => {
            onQuery('')
            navigate(href.project(ws.createProject(name).id))
          }}
          onClose={() => setCreating(false)}
        />
      )}
    </aside>
  )
}
