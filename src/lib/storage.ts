import { createStore, del, get, set } from 'idb-keyval'
import type { BoardMeta, Item, Project, ShareRecord, TrashedCard } from '../types'
import type { AchievementState } from './achievements'
import { normalizeItem } from './blocks'

// IndexedDB instead of localStorage: photos and videos are stored as Blobs.
//   projects        Project[]
//   boards          BoardMeta[]            (trashed boards carry deletedAt)
//   items:<boardId> Item[]
//   trash           TrashedCard[]
//   shares          ShareRecord[]
//   achievements    AchievementState
//   blob:<id>       Blob
const store = createStore('embeddd', 'board')

/* ---------- workspace ---------- */

let workspacePromise: Promise<{ projects: Project[]; boards: BoardMeta[] }> | null = null

/** Memoized so StrictMode's double effects can't run the migration twice. */
export function loadWorkspace() {
  workspacePromise ??= (async () => {
    const projects = (await get<Project[]>('projects', store)) ?? []
    let boards = await get<BoardMeta[]>('boards', store)

    if (!boards) {
      // Before projects existed there was a single board under "items".
      boards = []
      const legacy = await get<Item[]>('items', store)
      if (legacy?.length) {
        const now = Date.now()
        const board: BoardMeta = { id: crypto.randomUUID(), name: 'Untitled', projectId: null, createdAt: now, updatedAt: now }
        await set(`items:${board.id}`, legacy, store)
        boards.push(board)
      }
      await set('boards', boards, store)
      await del('items', store)
    }
    return { projects, boards }
  })()
  return workspacePromise
}

export const saveProjects = (projects: Project[]) => set('projects', projects, store)
export const saveBoards = (boards: BoardMeta[]) => set('boards', boards, store)

export const loadShares = async () => (await get<ShareRecord[]>('shares', store)) ?? []
export const saveShares = (shares: ShareRecord[]) => set('shares', shares, store)

export const loadTrash = async () =>
  ((await get<TrashedCard[]>('trash', store)) ?? []).map((t) => ({ ...t, item: normalizeItem(t.item) }))
export const saveTrash = (trash: TrashedCard[]) => set('trash', trash, store)

export const loadAchievements = () => get<AchievementState>('achievements', store)
export const saveAchievements = (state: AchievementState) => set('achievements', state, store)

/* ---------- board items ---------- */

export const loadItems = async (boardId: string) => ((await get<Item[]>(`items:${boardId}`, store)) ?? []).map(normalizeItem)
export const saveItems = (boardId: string, items: Item[]) => set(`items:${boardId}`, items, store)
export const deleteItems = (boardId: string) => del(`items:${boardId}`, store)

export function blobIdsOf(item: Item): string[] {
  if (item.kind === 'image' || item.kind === 'video' || item.kind === 'file') return [item.blobId]
  if (item.kind === 'link' && item.thumbId) return [item.thumbId]
  return []
}

/* ---------- blobs ---------- */

const urlCache = new Map<string, string>()

export const getBlob = (id: string) => get<Blob>(`blob:${id}`, store)
export const putBlob = (id: string, blob: Blob) => set(`blob:${id}`, blob, store)
export const deleteBlob = (id: string) => {
  const url = urlCache.get(id)
  if (url) URL.revokeObjectURL(url)
  urlCache.delete(id)
  return del(`blob:${id}`, store)
}

/** Object URLs are cached for the page lifetime so re-renders never flicker. */
export async function getBlobUrl(id: string): Promise<string | undefined> {
  const cached = urlCache.get(id)
  if (cached) return cached
  const blob = await getBlob(id)
  if (!blob) return undefined
  const url = URL.createObjectURL(blob)
  urlCache.set(id, url)
  return url
}

export function cacheBlobUrl(id: string, blob: Blob) {
  urlCache.set(id, URL.createObjectURL(blob))
}
