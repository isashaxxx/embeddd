import { upload } from '@vercel/blob/client'
import type { BoardMeta, Project, ShareManifest, ShareRecord, ShareScope } from '../types'
import { normalizeItem } from './blocks'
import { blobIdsOf, getBlob, loadItems } from './storage'

export const shareKey = (scope: ShareScope, targetId: string) => `${scope}:${targetId}`

export const shareUrl = (token: string) => `${window.location.origin}${window.location.pathname}#/s/${token}`

export const sharedBlobUrl = (token: string, blobId: string) => `/api/shares/${token}/blobs/${blobId}`

export async function createShareToken(): Promise<{ token: string; secret: string }> {
  const res = await fetch('/api/shares', { method: 'POST' })
  if (!res.ok) throw new Error(`Could not create link (${res.status})`)
  return res.json()
}

/** Boards included in a share: one board, or every board in the project. */
export function sharedBoards(record: Pick<ShareRecord, 'scope' | 'targetId'>, boards: BoardMeta[]) {
  const live = boards.filter((b) => !b.deletedAt)
  return record.scope === 'board'
    ? live.filter((b) => b.id === record.targetId)
    : live.filter((b) => b.projectId === record.targetId).sort((a, b) => b.updatedAt - a.updatedAt)
}

/** Cheap fingerprint of what a share shows; re-publish only when it changes. */
export function shareSignature(record: ShareRecord, boards: BoardMeta[], projects: Project[]) {
  const name = record.scope === 'project' ? projects.find((p) => p.id === record.targetId)?.name : ''
  return JSON.stringify([name, sharedBoards(record, boards).map((b) => [b.id, b.name, b.updatedAt, b.columns])])
}

export async function publishShare(record: ShareRecord, boards: BoardMeta[], projects: Project[]) {
  const included = sharedBoards(record, boards)
  const name =
    record.scope === 'project'
      ? (projects.find((p) => p.id === record.targetId)?.name ?? 'Project')
      : (included[0]?.name ?? 'Board')

  const manifest: ShareManifest = {
    version: 1,
    scope: record.scope,
    name,
    publishedAt: Date.now(),
    boards: await Promise.all(
      included.map(async (b) => ({
        id: b.id,
        name: b.name,
        updatedAt: b.updatedAt,
        columns: b.columns,
        // Link previews still loading have nothing worth showing yet.
        items: (await loadItems(b.id)).map((i) => (i.kind === 'link' && i.status === 'loading' ? { ...i, status: 'ready' as const } : i)),
      })),
    ),
  }

  const headers = { 'x-share-secret': record.secret }
  const res = await fetch(`/api/shares/${record.token}`, {
    method: 'PUT',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify(manifest),
  })
  if (!res.ok) throw new Error(`Publish failed (${res.status})`)
  const { missing, upload: mode } = (await res.json()) as { missing: string[]; upload?: 'direct' | 'client' }

  // Upload only files the server doesn't have yet.
  const known = new Set(manifest.boards.flatMap((b) => b.items.flatMap(blobIdsOf)))
  for (const id of missing) {
    if (!known.has(id)) continue
    const blob = await getBlob(id)
    if (!blob) continue
    if (mode === 'client') {
      // Production: straight to Vercel Blob, so large videos don't pass through a function.
      await upload(`shares/${record.token}/blobs/${id}`, blob, {
        access: 'public',
        handleUploadUrl: '/api/shares/upload',
        clientPayload: JSON.stringify({ token: record.token, secret: record.secret }),
        contentType: blob.type || 'application/octet-stream',
        multipart: blob.size > 8 * 1024 * 1024,
      })
      continue
    }
    const direct = await fetch(`/api/shares/${record.token}/blobs/${id}`, {
      method: 'PUT',
      headers: { ...headers, 'content-type': blob.type || 'application/octet-stream' },
      body: blob,
    })
    if (!direct.ok) throw new Error(`Upload failed (${direct.status})`)
  }
  return manifest.publishedAt
}

export async function deleteShare(record: ShareRecord) {
  await fetch(`/api/shares/${record.token}`, { method: 'DELETE', headers: { 'x-share-secret': record.secret } }).catch(() => {})
}

export async function fetchShare(token: string): Promise<ShareManifest | null> {
  const res = await fetch(`/api/shares/${encodeURIComponent(token)}`, { cache: 'no-store' })
  if (!res.ok) return null
  const manifest = (await res.json()) as ShareManifest
  // Links published by older versions still carry the old card shapes.
  manifest.boards.forEach((b) => (b.items = b.items.map(normalizeItem)))
  return manifest
}
