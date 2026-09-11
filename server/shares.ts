import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import type { Connect } from 'vite'
import { blobPathFor, getShareStore, type ShareStore } from './shareStore.js'

// Public links. Boards live in the owner's browser (IndexedDB), so sharing uploads a
// read-only snapshot and the owner's app re-publishes it as things change.
//
//   POST   /api/shares                   -> { token, secret }
//   PUT    /api/shares/:token            manifest JSON (secret)  -> { missing, upload }
//   PUT    /api/shares/:token/blobs/:id  raw bytes (secret)           [local store]
//   POST   /api/shares/upload            Vercel Blob client-upload token (secret) [Blob store]
//   DELETE /api/shares/:token            (secret)
//   GET    /api/shares/:token            manifest + file URLs (public)
//   GET    /api/shares/:token/blobs/:id  the file (public)

const MAX_MANIFEST = 4 * 1024 * 1024
const MAX_BLOB = 300 * 1024 * 1024
const TOKEN_RE = /^[A-Za-z0-9_-]{16,64}$/
const BLOB_RE = /^[A-Za-z0-9-]{1,100}$/

const hash = (secret: string) => createHash('sha256').update(secret).digest()

function send(res: ServerResponse, status: number, body?: unknown) {
  res.statusCode = status
  res.setHeader('cache-control', 'no-store')
  if (body === undefined) return void res.end()
  res.setHeader('content-type', 'application/json')
  res.end(JSON.stringify(body))
}

async function readBody(req: IncomingMessage): Promise<string> {
  // Vercel may have parsed the body already.
  const parsed = (req as IncomingMessage & { body?: unknown }).body
  if (parsed !== undefined) return typeof parsed === 'string' ? parsed : Buffer.isBuffer(parsed) ? parsed.toString('utf8') : JSON.stringify(parsed)
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_MANIFEST) throw new Error('too large')
    chunks.push(chunk)
  }
  return Buffer.concat(chunks).toString('utf8')
}

async function authorized(store: ShareStore, token: string, secret: unknown) {
  if (typeof secret !== 'string') return false
  const owner = await store.readOwner(token)
  if (!owner) return false
  const expected = Buffer.from(owner.secretHash, 'hex')
  const actual = hash(secret)
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

/** Blob ids referenced anywhere in the manifest's items. */
function referencedBlobs(manifest: { boards?: { items?: Record<string, unknown>[] }[] }) {
  const ids = new Set<string>()
  for (const board of manifest.boards ?? []) {
    for (const item of board.items ?? []) {
      for (const key of ['blobId', 'thumbId']) {
        const value = item[key]
        if (typeof value === 'string' && BLOB_RE.test(value)) ids.add(value)
      }
    }
  }
  return ids
}

export const sharesHandler: Connect.NextHandleFunction = async (req, res, next) => {
  const url = new URL(req.url ?? '/', 'http://local')
  if (!url.pathname.startsWith('/api/shares')) return next()
  const [, , , token, sub, blobId] = url.pathname.split('/')
  const method = req.method ?? 'GET'

  const store = getShareStore()
  if (!store) return send(res, 503, { error: 'Sharing needs a Vercel Blob store connected to this project.' })

  try {
    // Browser → Vercel Blob uploads: issue a short-lived token only for this share's own files.
    if (token === 'upload' && method === 'POST') {
      const body = JSON.parse(await readBody(req)) as HandleUploadBody
      const result = await handleUpload({
        body,
        request: req,
        onBeforeGenerateToken: async (pathname, clientPayload) => {
          const { token: shareToken, secret } = JSON.parse(clientPayload ?? '{}') as { token?: string; secret?: string }
          const id = pathname.split('/').pop() ?? ''
          if (!shareToken || !TOKEN_RE.test(shareToken) || pathname !== blobPathFor(shareToken, id) || !BLOB_RE.test(id)) {
            throw new Error('invalid upload path')
          }
          if (!(await authorized(store, shareToken, secret))) throw new Error('forbidden')
          return { maximumSizeInBytes: MAX_BLOB, addRandomSuffix: false, allowOverwrite: true }
        },
      })
      return send(res, 200, result)
    }

    if (!token) {
      if (method !== 'POST') return send(res, 405)
      const newToken = randomBytes(12).toString('base64url')
      const secret = randomBytes(24).toString('base64url')
      await store.writeOwner(newToken, { secretHash: hash(secret).toString('hex'), createdAt: Date.now() })
      return send(res, 201, { token: newToken, secret })
    }

    if (!TOKEN_RE.test(token)) return send(res, 404, { error: 'not found' })

    if (!sub) {
      if (method === 'GET') {
        const manifest = await store.readManifest(token)
        if (!manifest) return send(res, 404, { error: 'not found' })
        const files = await store.listBlobs(token)
        const blobUrls = Object.fromEntries([...files].filter(([, u]) => u))
        return send(res, 200, { ...JSON.parse(manifest), blobUrls })
      }
      if (!(await authorized(store, token, req.headers['x-share-secret']))) return send(res, 403, { error: 'forbidden' })

      if (method === 'DELETE') {
        await store.deleteAll(token)
        return send(res, 204)
      }

      if (method === 'PUT') {
        const text = await readBody(req)
        const manifest = JSON.parse(text) as { version?: number; boards?: unknown[] }
        if (manifest?.version !== 1 || !Array.isArray(manifest.boards)) return send(res, 400, { error: 'bad manifest' })
        await store.writeManifest(token, text)

        const wanted = referencedBlobs(manifest as Parameters<typeof referencedBlobs>[0])
        const present = await store.listBlobs(token)
        // Drop files for cards that were removed since the last publish.
        await store.deleteBlobs(token, [...present.keys()].filter((id) => !wanted.has(id)))
        return send(res, 200, { missing: [...wanted].filter((id) => !present.has(id)), upload: store.uploadMode })
      }
      return send(res, 405)
    }

    if (sub !== 'blobs' || !blobId || !BLOB_RE.test(blobId)) return send(res, 404, { error: 'not found' })

    if (method === 'GET' || method === 'HEAD') {
      return (await store.serveBlob(req, res, token, blobId)) ? undefined : send(res, 404, { error: 'not found' })
    }

    if (method === 'PUT' && store.putBlob) {
      if (!(await authorized(store, token, req.headers['x-share-secret']))) return send(res, 403, { error: 'forbidden' })
      if (Number(req.headers['content-length'] ?? 0) > MAX_BLOB) return send(res, 413, { error: 'file too large' })
      await store.putBlob(token, blobId, req, String(req.headers['content-type'] ?? 'application/octet-stream'), MAX_BLOB)
      return send(res, 204)
    }
    return send(res, 405)
  } catch (err) {
    if (!res.headersSent) send(res, 500, { error: String((err as Error).message ?? err) })
  }
}
