import { useState } from 'react'
import { Hash, X } from 'lucide-react'

interface Props {
  tags: string[]
  suggestions: string[]
  readOnly?: boolean
  onChange: (tags: string[]) => void
}

export const normalizeTag = (raw: string) => raw.trim().replace(/^#+/, '').replace(/\s+/g, '-').toLowerCase().slice(0, 40)

/** Chips + input: Enter or comma adds, Backspace on empty removes the last tag. */
export function TagInput({ tags, suggestions, readOnly, onChange }: Props) {
  const [draft, setDraft] = useState('')
  const q = normalizeTag(draft)
  const matches = q ? suggestions.filter((s) => s.includes(q) && !tags.includes(s)).slice(0, 6) : []

  const add = (raw: string) => {
    const tag = normalizeTag(raw)
    if (tag && !tags.includes(tag)) onChange([...tags, tag])
    setDraft('')
  }

  if (readOnly) {
    return tags.length ? (
      <div className="tags">
        {tags.map((t) => (
          <span key={t} className="tag">
            #{t}
          </span>
        ))}
      </div>
    ) : (
      <span className="detail-empty">No tags</span>
    )
  }

  return (
    <div className="tag-input">
      <div className="tags">
        {tags.map((t) => (
          <span key={t} className="tag">
            #{t}
            <button onClick={() => onChange(tags.filter((x) => x !== t))} aria-label={`Remove ${t}`}>
              <X size={11} />
            </button>
          </span>
        ))}
        <label className="tag-draft">
          <Hash size={13} />
          <input
            value={draft}
            placeholder={tags.length ? 'Add tag' : 'Add tags…'}
            onChange={(e) => {
              const value = e.target.value
              if (value.includes(',')) value.split(',').slice(0, -1).forEach(add)
              else setDraft(value)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                add(matches[0] && !suggestions.includes(q) ? matches[0] : draft)
              } else if (e.key === 'Backspace' && !draft && tags.length) {
                onChange(tags.slice(0, -1))
              }
            }}
            onBlur={() => draft && add(draft)}
          />
        </label>
      </div>
      {matches.length > 0 && (
        <div className="tag-suggestions">
          {matches.map((m) => (
            <button key={m} onMouseDown={(e) => e.preventDefault()} onClick={() => add(m)}>
              #{m}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
