import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

interface Props {
  title: string
  confirmLabel: string
  danger?: boolean
  /** Renders a text field; its value is passed to onConfirm. */
  input?: { defaultValue?: string; placeholder?: string }
  confirmDisabled?: boolean
  children?: ReactNode
  onConfirm: (value: string) => void
  onClose: () => void
}

export function Dialog({ title, confirmLabel, danger, input, confirmDisabled, children, onConfirm, onClose }: Props) {
  const [value, setValue] = useState(input?.defaultValue ?? '')
  const inputRef = useRef<HTMLInputElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)

  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const hasInput = !!input

  useEffect(() => {
    if (hasInput) inputRef.current?.select()
    else confirmRef.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCloseRef.current()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [hasInput])

  const disabled = confirmDisabled || (!!input && !value.trim())

  return createPortal(
    <div className="dialog-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <form
        className="dialog"
        role="dialog"
        aria-label={title}
        onSubmit={(e) => {
          e.preventDefault()
          if (disabled) return
          onConfirm(value)
          onClose()
        }}
      >
        <h3>{title}</h3>
        {input && (
          <input
            ref={inputRef}
            className="dialog-input"
            value={value}
            placeholder={input.placeholder}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                e.currentTarget.form?.requestSubmit()
              }
            }}
          />
        )}
        {children}
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button ref={confirmRef} type="submit" className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} disabled={disabled}>
            {confirmLabel}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  )
}
