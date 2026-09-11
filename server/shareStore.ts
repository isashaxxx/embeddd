import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, readdir, readFile, rm, stat, unlink, writeFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { del, list, put } from '@vercel/blob'

// Where published share snapshots live: a local folder in development, Vercel Blob in production.

export interface ShareStore {
  /** 'direct' = the client PUTs files to our API; 'client' = the browser uploads straight to Vercel Blob. */
  uploadMode: 'direct' | 'client'
  readOwner(token: string): Promise<{ secretHash: string } | null>
  writeOwner(token: string, owner: { secretHash: string; createdAt: number }): Promise<void>
  readManifest(token: string): Promise<string | null>
  writeManifest(token: string, json: string): Promise<void>
  /** Stored file ids, with public URLs when the store has them. */
  listBlobs(token: string): Promise<Map<string, string | null>>
  deleteBlobs(token: string, ids: string[]): Promise<void>
  deleteAll(token: string): Promise<void>
  putBlob?(token: string, id: string, req: IncomingMessage, type: string, maxBytes: number): Promise<void>
  serveBlob(req: IncomingMessage, res: ServerResponse, token: string, id: string): Promise<boolean>
}

/* ---------- local folder (dev) ---------- */

const ROOT = path.resolve('.data/shares')
const dirOf = (token: string) => path.join(ROOT, token)
const blobPath = (token: string, id: string) => path.join(dirOf(token), 'blobs', id)

const fsStore: ShareStore = {
  uploadMode: 'direct',

  async readOwner(token) {
    try {
      return JSON.parse(await readFile(path.join(dirOf(token), 'owner.json'), 'utf8'))
    } catch {
      return null
    }
  },

  async writeOwner(token, owner) {
    await mkdir(path.join(dirOf(token), 'blobs'), { recursive: true })
    await writeFile(path.join(dirOf(token), 'owner.json'), JSON.stringify(owner))
  },

  async readManifest(token) {
    try {
      return await readFile(path.join(dirOf(token), 'share.json'), 'utf8')
    } catch {
      return null
    }
  },

  async writeManifest(token, json) {
    await writeFile(path.join(dirOf(token), 'share.json'), json)
  },

  async listBlobs(token) {
    const dir = path.join(dirOf(token), 'blobs')
    await mkdir(dir, { recursive: true })
    return new Map((await readdir(dir)).filter((f) => !f.endsWith('.type')).map((id) => [id, null]))
  },

  async deleteBlobs(token, ids) {
    await Promise.all(ids.flatMap((id) => [unlink(blobPath(token, id)).catch(() => {}), unlink(`${blobPath(token, id)}.type`).catch(() => {})]))
  },

  async deleteAll(token) {
    await rm(dirOf(token), { recursive: true, force: true })
  },

  async putBlob(token, id, req, type, maxBytes) {
    const file = blobPath(token, id)
    let size = 0
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > maxBytes) req.destroy(new Error('file too large'))
    })
    await pipeline(req, createWriteStream(file))
    await writeFile(`${file}.type`, type)
  },

  async serveBlob(req, res, token, id) {
    const file = blobPath(token, id)
    let info
    try {
      info = await stat(file)
    } catch {
      return false
    }
    let type = 'application/octet-stream'
    try {
      type = (await readFile(`${file}.type`, 'utf8')) || type
    } catch {
      // unknown type
    }
    res.setHeader('content-type', type)
    res.setHeader('accept-ranges', 'bytes')
    res.setHeader('cache-control', 'public, max-age=31536000, immutable')

    // Safari won't play video without byte ranges.
    const range = req.headers.range?.match(/^bytes=(\d*)-(\d*)$/)
    if (range && (range[1] || range[2])) {
      const start = range[1] ? Number(range[1]) : Math.max(0, info.size - Number(range[2]))
      const end = range[1] && range[2] ? Math.min(Number(range[2]), info.size - 1) : info.size - 1
      if (start > end || start >= info.size) {
        res.statusCode = 416
        res.setHeader('content-range', `bytes */${info.size}`)
        res.end()
        return true
      }
      res.statusCode = 206
      res.setHeader('content-range', `bytes ${start}-${end}/${info.size}`)
      res.setHeader('content-length', String(end - start + 1))
      await pipeline(createReadStream(file, { start, end }), res)
      return true
    }
    res.statusCode = 200
    res.setHeader('content-length', String(info.size))
    await pipeline(createReadStream(file), res)
    return true
  },
}

/* ---------- Vercel Blob (production) ---------- */

// Files keep fixed paths (their ids never change content). The owner record and manifest are
// written under fresh random names and read back through list(), which is never stale the way
// a CDN-cached URL can be after an overwrite.

const prefix = (token: string) => `shares/${token}/`

async function listAll(pathPrefix: string) {
  const blobs = []
  let cursor: string | undefined
  do {
    const page = await list({ prefix: pathPrefix, cursor, limit: 1000 })
    blobs.push(...page.blobs)
    cursor = page.hasMore ? page.cursor : undefined
  } while (cursor)
  return blobs
}

async function readLatestJson(pathPrefix: string) {
  const blobs = await listAll(pathPrefix)
  const latest = blobs.sort((a, b) => +new Date(b.uploadedAt) - +new Date(a.uploadedAt))[0]
  if (!latest) return null
  const res = await fetch(latest.url, { cache: 'no-store' })
  return res.ok ? res.text() : null
}

async function replaceJson(pathPrefix: string, json: string) {
  const previous = await listAll(pathPrefix)
  await put(`${pathPrefix}.json`, json, { access: 'public', addRandomSuffix: true, contentType: 'application/json' })
  if (previous.length) await del(previous.map((b) => b.url))
}

const blobStore: ShareStore = {
  uploadMode: 'client',

  async readOwner(token) {
    const json = await readLatestJson(`${prefix(token)}owner`)
    return json ? JSON.parse(json) : null
  },

  writeOwner: (token, owner) => replaceJson(`${prefix(token)}owner`, JSON.stringify(owner)),
  readManifest: (token) => readLatestJson(`${prefix(token)}share`),
  writeManifest: (token, json) => replaceJson(`${prefix(token)}share`, json),

  async listBlobs(token) {
    const base = `${prefix(token)}blobs/`
    return new Map((await listAll(base)).map((b) => [b.pathname.slice(base.length), b.url]))
  },

  async deleteBlobs(token, ids) {
    const stored = await this.listBlobs(token)
    const urls = ids.map((id) => stored.get(id)).filter((u): u is string => !!u)
    if (urls.length) await del(urls)
  },

  async deleteAll(token) {
    const urls = (await listAll(prefix(token))).map((b) => b.url)
    if (urls.length) await del(urls)
  },

  async serveBlob(_req, res, token, id) {
    const url = (await this.listBlobs(token)).get(id)
    if (!url) return false
    res.statusCode = 302
    res.setHeader('location', url)
    res.end()
    return true
  },
}

export const blobPathFor = (token: string, id: string) => `${prefix(token)}blobs/${id}`

export function getShareStore(): ShareStore | null {
  if (process.env.BLOB_READ_WRITE_TOKEN) return blobStore
  // On Vercel the filesystem is read-only and per-instance, so without Blob there is no storage.
  if (process.env.VERCEL) return null
  return fsStore
}
