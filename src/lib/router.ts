import { useSyncExternalStore } from 'react'

export type Route =
  | { name: 'landing' }
  | { name: 'recent' }
  | { name: 'drafts' }
  | { name: 'trash' }
  | { name: 'achievements' }
  | { name: 'project'; id: string }
  | { name: 'board'; id: string }
  | { name: 'shared'; token: string; boardId?: string }

export const href = {
  landing: () => '#/',
  recent: () => '#/recent',
  drafts: () => '#/drafts',
  trash: () => '#/trash',
  achievements: () => '#/achievements',
  project: (id: string | null) => (id ? `#/project/${id}` : '#/drafts'),
  board: (id: string) => `#/board/${id}`,
  shared: (token: string, boardId?: string) => `#/s/${token}${boardId ? `/${boardId}` : ''}`,
}

function parse(hash: string): Route {
  const [, name, id, sub] = hash.replace(/^#/, '').split('/')
  if (!name) return { name: 'landing' }
  if (name === 'drafts') return { name: 'drafts' }
  if (name === 'trash') return { name: 'trash' }
  if (name === 'achievements') return { name: 'achievements' }
  if (name === 'project' && id) return { name: 'project', id }
  if (name === 'board' && id) return { name: 'board', id }
  if (name === 's' && id) return { name: 'shared', token: id, boardId: sub || undefined }
  return { name: 'recent' }
}

const subscribe = (onChange: () => void) => {
  window.addEventListener('hashchange', onChange)
  return () => window.removeEventListener('hashchange', onChange)
}

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash)
  return parse(hash)
}

export function navigate(to: string) {
  window.location.hash = to
}
