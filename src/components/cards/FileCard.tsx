import { Download, File, FileArchive, FileAudio, FileCode, FileImage, FileText, FileVideo } from 'lucide-react'
import { useBlobUrl } from '../../hooks/useBlobUrl'
import { formatBytes } from '../../lib/format'
import type { FileItem } from '../../types'

function iconFor(mime: string, name: string) {
  if (mime.startsWith('image/')) return FileImage
  if (mime.startsWith('video/')) return FileVideo
  if (mime.startsWith('audio/')) return FileAudio
  if (/zip|rar|7z|tar|gzip/.test(mime) || /\.(zip|rar|7z|tgz|gz)$/i.test(name)) return FileArchive
  if (mime.startsWith('text/') || /pdf|document|sheet|presentation/.test(mime)) return FileText
  if (/json|javascript|xml/.test(mime)) return FileCode
  return File
}

export function FileCard({ item }: { item: FileItem }) {
  const url = useBlobUrl(item.blobId)
  const Icon = iconFor(item.mime, item.name)
  const ext = item.name.includes('.') ? item.name.split('.').pop()!.toUpperCase() : 'FILE'

  return (
    <div className="file-card">
      <div className="file-icon">
        <Icon size={26} strokeWidth={1.5} />
        <span>{ext.slice(0, 4)}</span>
      </div>
      <div className="card-foot">
        <div className="title clamp-2" title={item.name}>
          {item.name}
        </div>
        <div className="sub">{formatBytes(item.bytes)}</div>
      </div>
      {url && (
        <a
          className="chip chip-light file-download"
          href={url}
          download={item.name}
          draggable={false}
          onClick={(e) => e.stopPropagation()}
        >
          <Download size={14} /> Download
        </a>
      )}
    </div>
  )
}
