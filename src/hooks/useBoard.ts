import { useCallback, useEffect, useRef, useState } from 'react'
import { createTextItem } from '../lib/blocks'
import { describeLink } from '../lib/linkMeta'
import { cacheBlobUrl, getBlobUrl, loadItems, putBlob, saveItems } from '../lib/storage'
import { defaultLinkSize, parseLink, sizeForAspect } from '../lib/platforms'
import type { BlockType, FileItem, Item, LinkItem, MediaItem, SketchItem, WidgetItem, WidgetType } from '../types'

interface UnfurlResponse {
  url?: string
  title?: string
  description?: string
  image?: string
  author?: string
}

function measureAspect(kind: 'image' | 'video', src: string): Promise<number> {
  return new Promise((resolve) => {
    if (kind === 'image') {
      const img = new Image()
      img.onload = () => resolve(img.naturalWidth / img.naturalHeight || 1)
      img.onerror = () => resolve(1)
      img.src = src
    } else {
      const video = document.createElement('video')
      video.preload = 'metadata'
      video.onloadedmetadata = () => resolve(video.videoWidth / video.videoHeight || 1)
      video.onerror = () => resolve(1)
      video.src = src
    }
  })
}

interface Callbacks {
  /** Fires on every edit (not on load), e.g. to bump "Edited …". */
  onChange: () => void
  /** A deleted card goes to Trash rather than disappearing. */
  onTrash: (item: Item, index: number) => void
  onAdded: (item: Item) => void
}

/** Items of one board, persisted to IndexedDB. */
export function useBoard(boardId: string, callbacks: Callbacks) {
  const [items, setItems] = useState<Item[]>([])
  const [loaded, setLoaded] = useState(false)
  const itemsRef = useRef(items)
  itemsRef.current = items
  const callbacksRef = useRef(callbacks)
  callbacksRef.current = callbacks
  const skipNextSave = useRef(true)

  useEffect(() => {
    let alive = true
    loadItems(boardId).then((list) => {
      // A late response (StrictMode's double mount, a quick board switch) must not
      // overwrite cards added since.
      if (!alive) return
      skipNextSave.current = true
      // A reload mid-unfurl leaves "loading" links behind; show what we have.
      setItems(list.map((i) => (i.kind === 'link' && i.status === 'loading' ? { ...i, status: 'ready' } : i)))
      setLoaded(true)
    })
    return () => {
      alive = false
    }
  }, [boardId])

  // Typing changes items on every keystroke; write to IndexedDB in short batches.
  const pendingSave = useRef(false)
  useEffect(() => {
    if (!loaded) return
    if (skipNextSave.current) {
      skipNextSave.current = false
      return
    }
    pendingSave.current = true
    const timer = setTimeout(() => {
      pendingSave.current = false
      saveItems(boardId, itemsRef.current)
      callbacksRef.current.onChange()
    }, 300)
    return () => clearTimeout(timer)
  }, [boardId, items, loaded])

  // Leaving the board mid-batch must not lose the last edit.
  useEffect(
    () => () => {
      if (!pendingSave.current) return
      pendingSave.current = false
      saveItems(boardId, itemsRef.current)
      callbacksRef.current.onChange()
    },
    [boardId],
  )

  const update = useCallback(<T extends Item>(id: string, patch: Partial<T>) => {
    setItems((list) => list.map((i) => (i.id === id ? ({ ...i, ...patch } as Item) : i)))
  }, [])

  const remove = useCallback((id: string) => {
    const index = itemsRef.current.findIndex((i) => i.id === id)
    if (index < 0) return
    callbacksRef.current.onTrash(itemsRef.current[index], index)
    setItems((list) => list.filter((i) => i.id !== id))
  }, [])

  const prepend = useCallback((...created: Item[]) => {
    setItems((list) => [...created, ...list])
    created.forEach((item) => callbacksRef.current.onAdded(item))
  }, [])

  const move = useCallback((fromId: string, toId: string) => {
    if (fromId === toId) return
    setItems((list) => {
      const from = list.findIndex((i) => i.id === fromId)
      const to = list.findIndex((i) => i.id === toId)
      if (from < 0 || to < 0) return list
      const next = [...list]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return next
    })
  }, [])

  const addText = useCallback(
    (type: BlockType = 'text'): string => {
      const item = createTextItem(type)
      prepend(item)
      return item.id
    },
    [prepend],
  )

  const addWidget = useCallback(
    (widget: WidgetType): string => {
      const item: WidgetItem = { id: crypto.randomUUID(), kind: 'widget', widget, size: 'S', createdAt: Date.now() }
      prepend(item)
      return item.id
    },
    [prepend],
  )

  const addSketch = useCallback((): string => {
    const item: SketchItem = { id: crypto.randomUUID(), kind: 'sketch', strokes: [], size: 'S', createdAt: Date.now() }
    prepend(item)
    return item.id
  }, [prepend])

  /** Photos and videos become media cards; anything else (or everything, with `asAttachments`) a file card. */
  const addFiles = useCallback(async (files: File[], { asAttachments = false } = {}) => {
    const created: (MediaItem | FileItem)[] = []
    for (const file of files) {
      const media = file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : null
      const id = crypto.randomUUID()
      await putBlob(id, file)
      cacheBlobUrl(id, file)
      if (media && !asAttachments) {
        const aspect = await measureAspect(media, (await getBlobUrl(id))!)
        created.push({ id, kind: media, blobId: id, size: sizeForAspect(aspect), createdAt: Date.now() })
      } else {
        created.push({
          id,
          kind: 'file',
          blobId: id,
          name: file.name,
          mime: file.type || 'application/octet-stream',
          bytes: file.size,
          size: 'S',
          createdAt: Date.now(),
        })
      }
    }
    if (created.length) prepend(...created)
  }, [prepend])

  const addLink = useCallback(
    async (url: string) => {
      const id = crypto.randomUUID()
      const item: LinkItem = {
        id,
        kind: 'link',
        url,
        size: defaultLinkSize(parseLink(url)),
        status: 'loading',
        createdAt: Date.now(),
      }
      prepend(item)

      const patch: Partial<LinkItem> = { status: 'ready' }
      try {
        const res = await fetch(`/api/unfurl?url=${encodeURIComponent(url)}`)
        const data: UnfurlResponse = res.ok ? await res.json() : {}
        Object.assign(patch, {
          title: data.title,
          metaDescription: data.description ?? '',
          author: data.author,
          resolvedUrl: data.url && data.url !== url ? data.url : undefined,
        })
        // Download the thumbnail once: CDN links (Instagram, TikTok) expire.
        if (data.image) {
          const img = await fetch(`/api/img?url=${encodeURIComponent(data.image)}`)
          if (img.ok) {
            const thumbId = `${id}-thumb`
            const blob = await img.blob()
            await putBlob(thumbId, blob)
            cacheBlobUrl(thumbId, blob)
            patch.thumbId = thumbId
          }
        }
      } catch {
        // No preview: the card still renders from the URL alone.
      }
      // Videos and pins get their title as a caption under the card, like Pinterest.
      const described = describeLink({ ...item, ...patch })
      if (patch.thumbId && (described.parsed.variant === 'video' || described.parsed.variant === 'post')) {
        patch.caption = described.title
      }
      update<LinkItem>(id, patch)
    },
    [update, prepend],
  )

  return { items, loaded, update, remove, move, addText, addWidget, addSketch, addFiles, addLink }
}
