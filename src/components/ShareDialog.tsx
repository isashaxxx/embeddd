import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, Copy, ExternalLink, Globe, Lock, X } from 'lucide-react'
import { useWorkspace } from '../hooks/useWorkspace'
import { shareKey, shareUrl } from '../lib/share'
import { timeAgo } from '../lib/time'
import type { ShareScope } from '../types'

interface Props {
  scope: ShareScope
  targetId: string
  name: string
  onClose: () => void
}

/** Figma-style share sheet: one switch for "anyone with the link can view", plus the link. */
export function ShareDialog({ scope, targetId, name, onClose }: Props) {
  const ws = useWorkspace()
  const record = ws.shares.find((r) => r.scope === scope && r.targetId === targetId)
  const status = ws.shareStatus[shareKey(scope, targetId)]
  const [copied, setCopied] = useState(false)
  const url = record ? shareUrl(record.token) : ''
  const enabling = !record && status?.state === 'syncing'

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const copy = async () => {
    await navigator.clipboard?.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  let statusText = ''
  if (status?.state === 'syncing') statusText = record ? 'Syncing changes…' : 'Creating link…'
  else if (status?.state === 'error') statusText = `Couldn’t sync: ${status.message}`
  else if (record?.publishedAt) statusText = `Up to date · published ${timeAgo(record.publishedAt)}`

  return createPortal(
    <div className="dialog-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog share-dialog" role="dialog" aria-label={`Share ${name}`}>
        <div className="share-head">
          <h3>Share “{name}”</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="share-row">
          <span className={`share-icon${record ? ' on' : ''}`}>{record ? <Globe size={18} /> : <Lock size={18} />}</span>
          <div className="share-row-text">
            <div>{record ? 'Anyone with the link' : 'Only you'}</div>
            <small>
              {record
                ? `can view this ${scope}${scope === 'project' ? ' and all its boards' : ''}`
                : `Turn on to get a public, view-only link to this ${scope}`}
            </small>
          </div>
          <button
            role="switch"
            aria-checked={!!record}
            className={`switch${record || enabling ? ' on' : ''}`}
            disabled={enabling}
            onClick={() => (record ? ws.disableShare(scope, targetId) : ws.enableShare(scope, targetId))}
            aria-label="Public link"
          >
            <span />
          </button>
        </div>

        {record && (
          <div className="share-link">
            <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} aria-label="Public link" />
            <a className="icon-btn" href={url} target="_blank" rel="noreferrer" title="Open link" aria-label="Open link">
              <ExternalLink size={16} />
            </a>
            <button className="btn btn-primary" onClick={copy}>
              {copied ? <Check size={15} /> : <Copy size={15} />}
              {copied ? 'Copied' : 'Copy link'}
            </button>
          </div>
        )}

        <p className={`share-status${status?.state === 'error' ? ' error' : ''}`}>
          {statusText || (record ? 'Changes you make are published automatically.' : ' ')}
        </p>
      </div>
    </div>,
    document.body,
  )
}
