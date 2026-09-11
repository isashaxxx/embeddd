import { strToU8, zipSync } from 'fflate'
import type { DocBlock, Item, WidgetItem } from '../types'
import { BG_COLOR, docPlainText, TEXT_COLOR } from './blocks'
import { formatBytes } from './format'
import { describeLink } from './linkMeta'
import { hostLabel, PLATFORM_LABEL } from './platforms'
import { sketchSvg } from './sketch'
import { blobIdsOf } from './storage'

export type ExportFormat = 'pdf' | 'md' | 'csv' | 'html'

export const EXPORT_LABEL: Record<ExportFormat, string> = {
  pdf: 'PDF',
  md: 'Markdown',
  html: 'HTML',
  csv: 'CSV',
}

type LoadBlob = (id: string) => Promise<Blob | undefined>

/** Media above this size is linked by name instead of inlined into HTML. */
const MAX_INLINE_BYTES = 25 * 1024 * 1024

const slug = (s: string) =>
  s
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 60) || 'board'

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

const escLines = (s: string) => esc(s).replace(/\n/g, '<br>')

function extFor(blob: Blob, fallback = 'bin') {
  const sub = blob.type.split('/')[1]?.split(/[+;]/)[0]
  return ({ jpeg: 'jpg', 'svg': 'svg', quicktime: 'mov', 'x-matroska': 'mkv' } as Record<string, string>)[sub] ?? sub ?? fallback
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/* ---------- Markdown ---------- */

function docToMarkdown(blocks: DocBlock[]): string {
  let n = 0
  const lines: string[] = []
  blocks.forEach((b, i) => {
    n = b.type === 'numbered' ? n + 1 : 0
    const text = b.text ?? ''
    const listLike = ['bulleted', 'numbered', 'todo'].includes(b.type)
    // Separate blocks with a blank line, but keep consecutive list items together.
    if (i > 0 && !(listLike && blocks[i - 1].type === b.type)) lines.push('')
    switch (b.type) {
      case 'h1':
      case 'h2':
      case 'h3':
      case 'h4':
        return lines.push(`${'#'.repeat(Number(b.type[1]))} ${text}`)
      case 'quote':
        return lines.push(text.split('\n').map((l) => `> ${l}`).join('\n'))
      case 'callout':
        return lines.push(`> ${b.icon ?? ''} ${text.split('\n').join('\n> ')}`)
      case 'bulleted':
        return lines.push(`- ${text}`)
      case 'numbered':
        return lines.push(`${n}. ${text}`)
      case 'todo':
        return lines.push(`- [${b.checked ? 'x' : ' '}] ${text}`)
      case 'toggle':
        return lines.push(`<details>\n<summary>${esc(text)}</summary>\n\n${b.body ?? ''}\n\n</details>`)
      case 'divider':
        return lines.push('---')
      case 'code':
        return lines.push(`\`\`\`${(b.language ?? '').toLowerCase().replace('plain text', '')}\n${text}\n\`\`\``)
      case 'emoji':
        return lines.push(b.icon ?? '')
      default:
        return lines.push(text)
    }
  })
  return lines.join('\n')
}

/** Title, description and tags the user attached to a card. */
function metaMarkdown(item: Item) {
  const parts = []
  if (item.description) parts.push(item.description)
  if (item.tags?.length) parts.push(item.tags.map((t) => `#${t}`).join(' '))
  return parts.length ? `\n\n${parts.join('\n\n')}` : ''
}

function widgetLabel(item: WidgetItem) {
  const place = item.city ? ` · ${item.city.name}` : ''
  return `${item.widget[0].toUpperCase()}${item.widget.slice(1)} widget${place}`
}

async function exportMarkdown(name: string, items: Item[], loadBlob: LoadBlob) {
  const assets: Record<string, Uint8Array> = {}
  const addAsset = (file: string, bytes: Uint8Array) => {
    const path = `assets/${Object.keys(assets).length + 1}-${file}`
    assets[path] = bytes
    return encodeURI(path)
  }
  const addBlob = async (id: string, base: string) => {
    const blob = await loadBlob(id)
    return blob ? addAsset(`${slug(base)}.${extFor(blob)}`, new Uint8Array(await blob.arrayBuffer())) : ''
  }

  const parts: string[] = [`# ${name}`]
  for (const item of items) {
    const heading = item.caption ? `## ${item.caption}\n\n` : ''
    let body = ''
    if (item.kind === 'text') body = docToMarkdown(item.blocks)
    else if (item.kind === 'image') body = `![${item.caption ?? ''}](${await addBlob(item.blobId, item.caption || 'image')})`
    else if (item.kind === 'video') body = `[🎬 ${item.caption || 'Video'}](${await addBlob(item.blobId, item.caption || 'video')})`
    else if (item.kind === 'file') {
      const blob = await loadBlob(item.blobId)
      const path = blob ? addAsset(item.name.replace(/[/\\]/g, '_'), new Uint8Array(await blob.arrayBuffer())) : ''
      body = `📎 [${item.name}](${path})`
    } else if (item.kind === 'sketch') {
      body = item.strokes.length ? `![Sketch](${addAsset('sketch.svg', strToU8(sketchSvg(item.strokes)))})` : '_Empty sketch_'
    } else if (item.kind === 'widget') {
      body = `_${widgetLabel(item)}_`
    } else if (item.kind === 'link') {
      const link = describeLink(item)
      body = `[${link.title}](${link.href})  \n${PLATFORM_LABEL[link.parsed.platform]} · ${link.subtitle}`
    }
    parts.push(heading + body + metaMarkdown(item))
  }
  const markdown = parts.join('\n\n---\n\n') + '\n'

  // A lone .md when there is nothing to bundle; otherwise a zip with the files next to it.
  if (!Object.keys(assets).length) {
    downloadBlob(new Blob([markdown], { type: 'text/markdown;charset=utf-8' }), `${slug(name)}.md`)
    return
  }
  const zip = zipSync({ [`${slug(name)}.md`]: strToU8(markdown), ...assets }, { level: 0 })
  downloadBlob(new Blob([zip.buffer as ArrayBuffer], { type: 'application/zip' }), `${slug(name)}.zip`)
}

/* ---------- CSV ---------- */

function exportCsv(name: string, items: Item[]) {
  const cell = (v: string | number | undefined) => {
    const s = String(v ?? '')
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const rows: (string | number | undefined)[][] = [['type', 'title', 'description', 'tags', 'content', 'url', 'size', 'created_at']]
  for (const item of items) {
    const common = [item.caption, item.description, item.tags?.join(', ')]
    const tail = [item.size, new Date(item.createdAt).toISOString()]
    if (item.kind === 'text') rows.push(['Text', ...common, docPlainText(item.blocks), '', ...tail])
    else if (item.kind === 'link') {
      const link = describeLink(item)
      rows.push([`${PLATFORM_LABEL[link.parsed.platform]} link`, item.caption ?? link.title, item.description ?? link.description, item.tags?.join(', '), link.title, link.href, ...tail])
    } else if (item.kind === 'file') rows.push(['File', ...common, item.name, '', ...tail])
    else if (item.kind === 'widget') rows.push(['Widget', ...common, widgetLabel(item), '', ...tail])
    else if (item.kind === 'sketch') rows.push(['Sketch', ...common, `${item.strokes.length} strokes`, '', ...tail])
    else rows.push([item.kind === 'image' ? 'Photo' : 'Video', ...common, '', '', ...tail])
  }
  // BOM so Excel opens UTF-8 (Cyrillic, emoji) correctly.
  const csv = '﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n')
  downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `${slug(name)}.csv`)
}

/* ---------- HTML / PDF ---------- */

function docToHtml(blocks: DocBlock[], print: boolean) {
  let html = ''
  let openList: string | null = null
  const closeList = () => {
    if (openList) html += `</${openList === 'numbered' ? 'ol' : 'ul'}>`
    openList = null
  }
  for (const b of blocks) {
    const style = [
      b.color && b.color !== 'default' ? `color:${TEXT_COLOR[b.color]}` : '',
      b.background && b.background !== 'default' ? `background:${BG_COLOR[b.background]}` : '',
    ]
      .filter(Boolean)
      .join(';')
    const attr = style ? ` style="${style}"` : ''
    const text = escLines(b.text ?? '')
    const listTag = b.type === 'numbered' ? 'ol' : b.type === 'bulleted' || b.type === 'todo' ? 'ul' : null
    if (openList !== (listTag ? b.type : null)) {
      closeList()
      if (listTag) {
        html += `<${listTag}${b.type === 'todo' ? ' class="todo"' : ''}>`
        openList = b.type
      }
    }
    switch (b.type) {
      case 'h1':
      case 'h2':
      case 'h3':
      case 'h4':
        html += `<${b.type}${attr}>${text}</${b.type}>`
        break
      case 'bulleted':
      case 'numbered':
        html += `<li${attr}>${text}</li>`
        break
      case 'todo':
        html += `<li class="${b.checked ? 'done' : ''}"${attr}><span class="box">${b.checked ? '✓' : ''}</span>${text}</li>`
        break
      case 'toggle':
        html += `<details${print ? ' open' : ''}${attr}><summary>${text}</summary><p>${escLines(b.body ?? '')}</p></details>`
        break
      case 'quote':
        html += `<blockquote${attr}>${text}</blockquote>`
        break
      case 'callout':
        html += `<div class="callout"${style ? attr : ' style="background:#f1f1ef"'}><span class="callout-icon">${esc(b.icon ?? '')}</span><div>${text}</div></div>`
        break
      case 'divider':
        html += '<hr>'
        break
      case 'code':
        html += `<div class="code"${attr}><span class="lang">${esc(b.language ?? '')}</span><pre><code>${esc(b.text ?? '')}</code></pre></div>`
        break
      case 'emoji':
        html += `<div class="emoji">${esc(b.icon ?? '')}</div>`
        break
      default:
        html += `<p${attr}>${text || '&nbsp;'}</p>`
    }
  }
  closeList()
  return html
}

async function renderHtml(name: string, items: Item[], loadBlob: LoadBlob, print: boolean) {
  const dataUrls = new Map<string, string>()
  for (const id of items.flatMap(blobIdsOf)) {
    const blob = await loadBlob(id)
    if (blob && blob.size <= MAX_INLINE_BYTES && !(print && blob.type.startsWith('video/'))) {
      dataUrls.set(id, await blobToDataUrl(blob))
    }
  }

  const figcaption = (item: Item, fallback?: string) => {
    const title = item.caption ?? fallback
    const tags = item.tags?.length ? `<span class="tags">${item.tags.map((t) => `#${esc(t)}`).join(' ')}</span>` : ''
    const description = item.description ? `<p class="description">${escLines(item.description)}</p>` : ''
    return title || tags || description ? `<figcaption>${title ? `<b>${esc(title)}</b>` : ''}${description}${tags}</figcaption>` : ''
  }

  const body = items
    .map((item) => {
      if (item.kind === 'text') return `<figure class="item"><div class="doc">${docToHtml(item.blocks, print)}</div>${figcaption(item)}</figure>`
      if (item.kind === 'image') {
        const src = dataUrls.get(item.blobId)
        return `<figure class="item">${src ? `<img src="${src}" alt="">` : '<div class="missing">Image</div>'}${figcaption(item)}</figure>`
      }
      if (item.kind === 'video') {
        const src = dataUrls.get(item.blobId)
        return `<figure class="item">${src ? `<video src="${src}" controls playsinline></video>` : '<div class="missing">▶ Video</div>'}${figcaption(item)}</figure>`
      }
      if (item.kind === 'file') {
        const src = dataUrls.get(item.blobId)
        const label = `<span class="file-icon">📎</span><span><b>${esc(item.name)}</b><small>${formatBytes(item.bytes)}</small></span>`
        return `<figure class="item">${
          src && !print ? `<a class="file" href="${src}" download="${esc(item.name)}">${label}</a>` : `<div class="file">${label}</div>`
        }${figcaption(item)}</figure>`
      }
      if (item.kind === 'sketch') return `<figure class="item"><div class="sketch">${sketchSvg(item.strokes)}</div>${figcaption(item)}</figure>`
      if (item.kind === 'widget') return `<figure class="item"><div class="missing">${esc(widgetLabel(item))}</div>${figcaption(item)}</figure>`
      if (item.kind !== 'link') return ''
      const link = describeLink(item)
      const thumb = item.thumbId ? dataUrls.get(item.thumbId) : undefined
      return `<figure class="item"><a class="link" href="${esc(link.href)}" target="_blank" rel="noopener">${
        thumb ? `<img src="${thumb}" alt="">` : ''
      }<span class="link-text"><small>${esc(PLATFORM_LABEL[link.parsed.platform])}</small><b>${esc(link.title)}</b><small>${esc(
        hostLabel(link.href),
      )}</small></span></a>${figcaption({ ...item, caption: item.caption === link.title ? undefined : item.caption })}</figure>`
    })
    .join('\n')

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(name)}</title>
<style>
*{box-sizing:border-box}
body{margin:0;padding:40px;font:15px/1.5 Inter,ui-sans-serif,system-ui,-apple-system,sans-serif;color:#111;background:#fff}
h1.board-title{margin:0 0 28px;font-size:32px;letter-spacing:-.03em}
.board{column-width:240px;column-gap:16px}
.item{break-inside:avoid;margin:0 0 16px;border:1px solid #ececec;border-radius:16px;overflow:hidden;background:#fff}
.item img,.item video{display:block;width:100%;height:auto}
figcaption{display:flex;flex-direction:column;gap:4px;padding:10px 14px;font-size:14px;border-top:1px solid #f0f0f0}
figcaption .description{margin:0;color:#555}figcaption .tags{color:#0b72c4;font-size:12px}
.doc{padding:16px 18px;display:flex;flex-direction:column;gap:4px}
.doc h1,.doc h2,.doc h3,.doc h4,.doc p{margin:0;letter-spacing:-.02em}
.doc h1{font-size:28px}.doc h2{font-size:22px}.doc h3{font-size:18px}.doc h4{font-size:16px}
.doc [style*=background]{padding:2px 6px;border-radius:4px}
.sketch svg{display:block;width:100%;height:auto;max-height:420px}
.doc ul,.doc ol{margin:0;padding-left:20px}
.todo{list-style:none;padding-left:0!important}.todo li{display:flex;gap:8px}.todo .done{color:#999;text-decoration:line-through}
.box{flex:none;width:16px;height:16px;margin-top:3px;border:1.5px solid #bbb;border-radius:4px;font-size:11px;line-height:13px;text-align:center}
.done .box{background:#2383e2;border-color:#2383e2;color:#fff}
blockquote{margin:0;padding-left:14px;border-left:3px solid currentColor;font-size:17px}
.callout{display:flex;gap:10px;padding:10px 12px;border-radius:8px}.callout-icon{font-size:20px}
details summary{cursor:pointer;font-weight:500}details p{margin:6px 0 0 16px}
hr{border:0;border-top:1px solid #ddd;margin:8px 0;width:100%}
.code{position:relative;background:#f7f6f3;border-radius:10px;padding:14px}.code pre{margin:0;white-space:pre-wrap;font:13px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace}
.lang{display:block;font-size:11px;color:#999;margin-bottom:6px}
.emoji{font-size:96px;text-align:center;line-height:1.2}
.link{display:block;color:inherit;text-decoration:none}.link-text{display:flex;flex-direction:column;padding:12px 14px}.link-text small{color:#888}
.file{display:flex;gap:12px;align-items:center;padding:16px;color:inherit;text-decoration:none}.file-icon{font-size:26px}.file small{display:block;color:#888}
.missing{padding:40px;text-align:center;color:#999;background:#f5f5f5}
@media print{body{padding:0}.item{box-shadow:none}@page{margin:14mm}}
</style></head>
<body><h1 class="board-title">${esc(name)}</h1><div class="board">
${body}
</div></body></html>`
}

async function exportPdf(name: string, items: Item[], loadBlob: LoadBlob) {
  // The browser's print engine gives selectable text and crisp images; choose "Save as PDF".
  const html = await renderHtml(name, items, loadBlob, true)
  const frame = document.createElement('iframe')
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'
  document.body.append(frame)
  await new Promise<void>((resolve) => {
    frame.onload = () => resolve()
    frame.srcdoc = html
  })
  const doc = frame.contentDocument!
  await Promise.all(
    Array.from(doc.images).map((img) => (img.complete ? null : new Promise((r) => img.addEventListener('load', r, { once: true })))),
  )
  // The frame's <title> becomes the suggested PDF file name.
  frame.contentWindow!.focus()
  frame.contentWindow!.print()
  setTimeout(() => frame.remove(), 60_000)
}

export async function exportBoard(format: ExportFormat, name: string, items: Item[], loadBlob: LoadBlob) {
  if (format === 'csv') return exportCsv(name, items)
  if (format === 'md') return exportMarkdown(name, items, loadBlob)
  if (format === 'pdf') return exportPdf(name, items, loadBlob)
  const html = await renderHtml(name, items, loadBlob, false)
  downloadBlob(new Blob([html], { type: 'text/html;charset=utf-8' }), `${slug(name)}.html`)
}
