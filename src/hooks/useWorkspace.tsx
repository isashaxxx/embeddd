import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  blobIdsOf,
  deleteBlob,
  deleteItems,
  getBlob,
  loadItems,
  loadShares,
  loadTrash,
  loadWorkspace,
  putBlob,
  saveBoards,
  saveItems,
  saveProjects,
  saveShares,
  saveTrash,
} from '../lib/storage'
import { useAchievements } from './useAchievements'
import { createShareToken, deleteShare, publishShare, shareKey, shareSignature } from '../lib/share'
import type { BoardMeta, Item, Project, ShareRecord, ShareScope, TrashedCard } from '../types'

export const TRASH_DAYS = 30

export type ShareStatus = { state: 'syncing' | 'ok' | 'error'; message?: string }

function useWorkspaceState() {
  const [projects, setProjects] = useState<Project[]>([])
  const [boards, setBoards] = useState<BoardMeta[]>([])
  const [shares, setShares] = useState<ShareRecord[]>([])
  const [trash, setTrash] = useState<TrashedCard[]>([])
  const { track } = useAchievements()
  const [shareStatus, setShareStatus] = useState<Record<string, ShareStatus>>({})
  const [loaded, setLoaded] = useState(false)
  const boardsRef = useRef(boards)
  boardsRef.current = boards
  const sharesRef = useRef(shares)
  sharesRef.current = shares
  const trashRef = useRef(trash)
  trashRef.current = trash
  const projectsRef = useRef(projects)
  projectsRef.current = projects

  useEffect(() => {
    Promise.all([loadWorkspace(), loadShares(), loadTrash()]).then(([ws, savedShares, savedTrash]) => {
      setProjects(ws.projects)
      setBoards(ws.boards)
      setShares(savedShares)
      setTrash(savedTrash)
      setLoaded(true)
    })
  }, [])

  useEffect(() => {
    if (loaded) saveShares(shares)
  }, [shares, loaded])

  useEffect(() => {
    if (loaded) saveTrash(trash)
  }, [trash, loaded])

  // Keep public links in sync: re-publish a share shortly after anything it shows changes.
  // After a reload every share is published once, which also heals a failed earlier sync.
  const publishedSignatures = useRef(new Map<string, string>())
  useEffect(() => {
    if (!loaded || !shares.length) return
    const timer = setTimeout(async () => {
      for (const record of shares) {
        const key = shareKey(record.scope, record.targetId)
        const signature = shareSignature(record, boards, projects)
        if (publishedSignatures.current.get(key) === signature) continue
        publishedSignatures.current.set(key, signature)
        setShareStatus((s) => ({ ...s, [key]: { state: 'syncing' } }))
        try {
          const publishedAt = await publishShare(record, boards, projects)
          setShares((list) => list.map((r) => (r.token === record.token ? { ...r, publishedAt } : r)))
          setShareStatus((s) => ({ ...s, [key]: { state: 'ok' } }))
        } catch (err) {
          publishedSignatures.current.delete(key)
          setShareStatus((s) => ({ ...s, [key]: { state: 'error', message: String((err as Error).message ?? err) } }))
        }
      }
    }, 1200)
    return () => clearTimeout(timer)
  }, [loaded, shares, boards, projects])

  const enableShare = useCallback(async (scope: ShareScope, targetId: string) => {
    if (sharesRef.current.some((r) => r.scope === scope && r.targetId === targetId)) return
    const key = shareKey(scope, targetId)
    setShareStatus((s) => ({ ...s, [key]: { state: 'syncing' } }))
    try {
      const { token, secret } = await createShareToken()
      setShares((list) => [...list, { scope, targetId, token, secret, createdAt: Date.now() }])
      track('shares')
    } catch (err) {
      setShareStatus((s) => ({ ...s, [key]: { state: 'error', message: String((err as Error).message ?? err) } }))
    }
  }, [track])

  const disableShare = useCallback((scope: ShareScope, targetId: string) => {
    const record = sharesRef.current.find((r) => r.scope === scope && r.targetId === targetId)
    const key = shareKey(scope, targetId)
    publishedSignatures.current.delete(key)
    setShareStatus(({ [key]: _, ...rest }) => rest)
    if (!record) return
    setShares((list) => list.filter((r) => r !== record))
    deleteShare(record)
  }, [])

  useEffect(() => {
    if (loaded) saveProjects(projects)
  }, [projects, loaded])

  useEffect(() => {
    if (loaded) saveBoards(boards)
  }, [boards, loaded])

  const patchBoard = useCallback((id: string, patch: Partial<BoardMeta>) => {
    setBoards((list) => list.map((b) => (b.id === id ? { ...b, ...patch } : b)))
  }, [])

  const createProject = useCallback(
    (name: string): Project => {
      const project: Project = { id: crypto.randomUUID(), name: name.trim() || 'Untitled project', createdAt: Date.now() }
      setProjects((list) => [...list, project])
      track('projects')
      return project
    },
    [track],
  )

  const renameProject = useCallback((id: string, name: string) => {
    if (!name.trim()) return
    setProjects((list) => list.map((p) => (p.id === id ? { ...p, name: name.trim() } : p)))
  }, [])

  const createBoard = useCallback(
    (projectId: string | null): BoardMeta => {
      const now = Date.now()
      const board: BoardMeta = { id: crypto.randomUUID(), name: 'Untitled', projectId, createdAt: now, updatedAt: now }
      setBoards((list) => [board, ...list])
      track('boards')
      return board
    },
    [track],
  )

  const renameBoard = useCallback(
    (id: string, name: string) => {
      if (name.trim()) patchBoard(id, { name: name.trim(), updatedAt: Date.now() })
    },
    [patchBoard],
  )

  const moveBoard = useCallback(
    (id: string, projectId: string | null) => patchBoard(id, { projectId, updatedAt: Date.now() }),
    [patchBoard],
  )

  /** Copies blobs too, so deleting a card in one board never breaks the other. */
  const duplicateBoard = useCallback(
    async (id: string): Promise<BoardMeta | undefined> => {
      const source = boardsRef.current.find((b) => b.id === id)
      if (!source) return
      const copyBlob = async (blobId: string) => {
        const blob = await getBlob(blobId)
        const newId = crypto.randomUUID()
        if (blob) await putBlob(newId, blob)
        return newId
      }
      const items: Item[] = await Promise.all(
        (await loadItems(id)).map(async (item): Promise<Item> => {
          const copy = structuredClone(item)
          copy.id = crypto.randomUUID()
          if (copy.kind === 'image' || copy.kind === 'video' || copy.kind === 'file') copy.blobId = await copyBlob(copy.blobId)
          if (copy.kind === 'link' && copy.thumbId) copy.thumbId = await copyBlob(copy.thumbId)
          return copy
        }),
      )
      const now = Date.now()
      const board: BoardMeta = { ...source, id: crypto.randomUUID(), name: `${source.name} (Copy)`, createdAt: now, updatedAt: now, openedAt: undefined }
      await saveItems(board.id, items)
      setBoards((list) => [board, ...list])
      track('boards')
      return board
    },
    [track],
  )

  /* ---------- trash ---------- */

  /** Removes a board's data for good: items, their files, and any public link. */
  const purgeBoard = useCallback(
    async (id: string) => {
      disableShare('board', id)
      setBoards((list) => list.filter((b) => b.id !== id))
      const items = await loadItems(id)
      await Promise.all(items.flatMap(blobIdsOf).map(deleteBlob))
      await deleteItems(id)
    },
    [disableShare],
  )

  const trashBoard = useCallback(
    (id: string) => {
      disableShare('board', id)
      patchBoard(id, { deletedAt: Date.now() })
    },
    [disableShare, patchBoard],
  )

  const restoreBoard = useCallback(
    (id: string) => {
      setBoards((list) =>
        list.map((b) =>
          b.id === id
            ? {
                ...b,
                deletedAt: undefined,
                // Its project may be gone by now; Drafts is the safe home.
                projectId: b.projectId && projectsRef.current.some((p) => p.id === b.projectId) ? b.projectId : null,
              }
            : b,
        ),
      )
      track('restored')
    },
    [track],
  )

  /** Called by a board when a card is deleted; the card's files stay until Trash lets go of it. */
  const trashCard = useCallback((boardId: string, item: Item, index: number) => {
    const boardName = boardsRef.current.find((b) => b.id === boardId)?.name ?? 'Board'
    setTrash((list) => [{ item, boardId, boardName, index, deletedAt: Date.now() }, ...list.filter((t) => t.item.id !== item.id)])
  }, [])

  const restoreCard = useCallback(
    async (itemId: string) => {
      const entry = trashRef.current.find((t) => t.item.id === itemId)
      if (!entry) return
      let board = boardsRef.current.find((b) => b.id === entry.boardId)
      if (!board) {
        const now = Date.now()
        board = { id: crypto.randomUUID(), name: `Restored from ${entry.boardName}`, projectId: null, createdAt: now, updatedAt: now }
        const created = board
        setBoards((list) => [created, ...list])
      } else if (board.deletedAt) {
        restoreBoard(board.id)
      }
      const items = await loadItems(board.id)
      items.splice(Math.min(entry.index, items.length), 0, entry.item)
      await saveItems(board.id, items)
      patchBoard(board.id, { updatedAt: Date.now() })
      setTrash((list) => list.filter((t) => t.item.id !== itemId))
      track('restored')
      return board
    },
    [patchBoard, restoreBoard, track],
  )

  const deleteCardForever = useCallback(async (itemId: string) => {
    const entry = trashRef.current.find((t) => t.item.id === itemId)
    if (!entry) return
    setTrash((list) => list.filter((t) => t.item.id !== itemId))
    await Promise.all(blobIdsOf(entry.item).map(deleteBlob))
  }, [])

  const emptyTrash = useCallback(async () => {
    const cards = trashRef.current
    const trashedBoards = boardsRef.current.filter((b) => b.deletedAt)
    setTrash([])
    await Promise.all([...cards.flatMap((t) => blobIdsOf(t.item)).map(deleteBlob), ...trashedBoards.map((b) => purgeBoard(b.id))])
    track('emptiedTrash')
  }, [purgeBoard, track])

  // Trash keeps things for 30 days.
  useEffect(() => {
    if (!loaded) return
    const cutoff = Date.now() - TRASH_DAYS * 24 * 60 * 60 * 1000
    const expiredCards = trashRef.current.filter((t) => t.deletedAt < cutoff)
    if (expiredCards.length) {
      setTrash((list) => list.filter((t) => t.deletedAt >= cutoff))
      expiredCards.flatMap((t) => blobIdsOf(t.item)).forEach(deleteBlob)
    }
    boardsRef.current.filter((b) => b.deletedAt && b.deletedAt < cutoff).forEach((b) => purgeBoard(b.id))
  }, [loaded, purgeBoard])

  const deleteProject = useCallback(
    (id: string) => {
      disableShare('project', id)
      boardsRef.current.filter((b) => b.projectId === id && !b.deletedAt).forEach((b) => trashBoard(b.id))
      setProjects((list) => list.filter((p) => p.id !== id))
    },
    [disableShare, trashBoard],
  )

  const activeBoards = useMemo(() => boards.filter((b) => !b.deletedAt), [boards])

  return {
    loaded,
    projects,
    boards,
    activeBoards,
    trash,
    shares,
    shareStatus,
    enableShare,
    disableShare,
    patchBoard,
    createProject,
    renameProject,
    deleteProject,
    createBoard,
    renameBoard,
    moveBoard,
    duplicateBoard,
    trashBoard,
    restoreBoard,
    purgeBoard,
    trashCard,
    restoreCard,
    deleteCardForever,
    emptyTrash,
    track,
  }
}

export type Workspace = ReturnType<typeof useWorkspaceState>

const WorkspaceContext = createContext<Workspace | null>(null)

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  return <WorkspaceContext.Provider value={useWorkspaceState()}>{children}</WorkspaceContext.Provider>
}

export function useWorkspace() {
  const ws = useContext(WorkspaceContext)
  if (!ws) throw new Error('useWorkspace must be used inside WorkspaceProvider')
  return ws
}
