import { useState, type ReactNode } from 'react'
import {
  Check,
  Copy,
  ExternalLink,
  FileDown,
  FileText,
  Folder,
  FolderInput,
  Globe,
  Pencil,
  SquareArrowOutUpRight,
  Trash2,
} from 'lucide-react'
import { Dialog } from '../components/Dialog'
import type { MenuEntry } from '../components/Menu'
import { ShareDialog } from '../components/ShareDialog'
import { EXPORT_LABEL, exportBoard, type ExportFormat } from '../lib/export'
import { href, navigate } from '../lib/router'
import { getBlob, loadItems } from '../lib/storage'
import type { BoardMeta } from '../types'
import { useToast } from './useToasts'
import { useWorkspace } from './useWorkspace'

type Pending = 'move' | 'share' | null

interface Options {
  /** Where to go after deleting (board page leaves; dashboard stays). */
  onDeleted?: () => void
  /** Rename inline (tiles) instead of in a dialog (board page has its own title field). */
  onRename?: () => void
  /** Board page is already open, so "Open" entries are hidden. */
  isOpen?: boolean
}

/** File actions shared by board tiles and the board page: the same menu everywhere, like Figma. */
export function useBoardActions(board: BoardMeta, { onDeleted, onRename, isOpen }: Options = {}) {
  const ws = useWorkspace()
  const toast = useToast()
  const [pending, setPending] = useState<Pending>(null)
  const [target, setTarget] = useState<string | null>(board.projectId)

  const entries: MenuEntry[] = [
    ...(isOpen
      ? []
      : ([
          { label: 'Open', icon: <SquareArrowOutUpRight size={15} />, onSelect: () => navigate(href.board(board.id)) },
          { label: 'Open in new tab', icon: <ExternalLink size={15} />, onSelect: () => window.open(href.board(board.id), '_blank') },
          'separator',
        ] satisfies MenuEntry[])),
    ...(onRename ? [{ label: 'Rename', icon: <Pencil size={15} />, onSelect: onRename }] : []),
    {
      label: 'Duplicate',
      icon: <Copy size={15} />,
      onSelect: async () => {
        const copy = await ws.duplicateBoard(board.id)
        if (copy && isOpen) navigate(href.board(copy.id))
      },
    },
    {
      label: 'Move to project…',
      icon: <FolderInput size={15} />,
      onSelect: () => {
        setTarget(board.projectId)
        setPending('move')
      },
    },
    { label: 'Share…', icon: <Globe size={15} />, onSelect: () => setPending('share') },
    'separator',
    ...(['pdf', 'md', 'html', 'csv'] as ExportFormat[]).map((format) => ({
      label: `Export as ${EXPORT_LABEL[format]}`,
      icon: <FileDown size={15} />,
      onSelect: async () => {
        await exportBoard(format, board.name, await loadItems(board.id), getBlob)
        ws.track('exports')
      },
    })),
    'separator',
    {
      label: 'Move to Trash',
      icon: <Trash2 size={15} />,
      danger: true,
      // Like Figma: no confirmation, since Trash keeps it for 30 days and Undo is one click away.
      onSelect: () => {
        ws.trashBoard(board.id)
        onDeleted?.()
        toast({ title: `“${board.name}” moved to Trash`, action: { label: 'Undo', onClick: () => ws.restoreBoard(board.id) } })
      },
    },
  ]

  const openShare = () => setPending('share')

  const destinations: { id: string | null; name: string; icon: ReactNode }[] = [
    { id: null, name: 'Drafts', icon: <FileText size={16} /> },
    ...ws.projects.map((p) => ({ id: p.id, name: p.name, icon: <Folder size={16} /> })),
  ]

  const dialogs =
    pending === 'share' ? (
      <ShareDialog scope="board" targetId={board.id} name={board.name} onClose={() => setPending(null)} />
    ) : pending === 'move' ? (
      <Dialog
        title={`Move “${board.name}”`}
        confirmLabel="Move"
        confirmDisabled={target === board.projectId}
        onConfirm={() => ws.moveBoard(board.id, target)}
        onClose={() => setPending(null)}
      >
        <div className="dest-list">
          {destinations.map((d) => (
            <button
              key={d.id ?? 'drafts'}
              type="button"
              className={`dest${d.id === target ? ' active' : ''}`}
              onClick={() => setTarget(d.id)}
            >
              {d.icon}
              <span>{d.name}</span>
              {d.id === board.projectId && <span className="dest-current">current</span>}
              {d.id === target && <Check size={16} className="dest-check" />}
            </button>
          ))}
        </div>
      </Dialog>
    ) : null

  return { entries, dialogs, openShare }
}
