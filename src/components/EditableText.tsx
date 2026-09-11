import { useEffect, useRef, type KeyboardEvent } from 'react'

interface Props {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  autoFocus?: boolean
  readOnly?: boolean
  onKeyDown?: (e: KeyboardEvent<HTMLDivElement>) => void
  onBlur?: (value: string) => void
}

/** Characters before the caret, counting line breaks as one character. */
export function getCaretOffset(el: HTMLElement): number {
  const sel = window.getSelection()
  if (!sel || !sel.rangeCount || !el.contains(sel.anchorNode)) return 0
  const range = sel.getRangeAt(0).cloneRange()
  range.selectNodeContents(el)
  range.setEnd(sel.getRangeAt(0).startContainer, sel.getRangeAt(0).startOffset)
  const fragment = document.createElement('div')
  fragment.append(range.cloneContents())
  return fragment.textContent!.length + fragment.querySelectorAll('br').length
}

/** Places the caret `at` characters in, or at the end. */
export function setCaret(el: HTMLElement, at: number | 'end') {
  el.focus()
  const sel = window.getSelection()
  if (!sel) return
  const range = document.createRange()
  if (at === 'end') {
    range.selectNodeContents(el)
    range.collapse(false)
  } else {
    let remaining = at
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    let node = walker.nextNode()
    let placed = false
    while (node) {
      const length = node.textContent?.length ?? 0
      if (remaining <= length) {
        range.setStart(node, remaining)
        placed = true
        break
      }
      remaining -= length
      node = walker.nextNode()
    }
    if (!placed) {
      range.selectNodeContents(el)
      range.collapse(at === 0)
    }
    range.collapse(true)
  }
  sel.removeAllRanges()
  sel.addRange(range)
}

/** Plain-text contentEditable that stays uncontrolled while typing, so the caret never jumps. */
export function EditableText({ value, onChange, placeholder, className, autoFocus, readOnly, onKeyDown, onBlur }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  // Runs after every render: a parent may rewrite the text (e.g. "# " becoming a heading)
  // without the value prop changing, and the DOM must follow.
  useEffect(() => {
    if (ref.current && ref.current.innerText.replace(/\n$/, '') !== value) ref.current.innerText = value
  })

  useEffect(() => {
    if (autoFocus && ref.current && !readOnly) setCaret(ref.current, 'end')
  }, [autoFocus, readOnly])

  return (
    <div
      ref={ref}
      className={`editable ${className ?? ''}`}
      contentEditable={readOnly ? false : 'plaintext-only'}
      suppressContentEditableWarning
      data-placeholder={readOnly ? undefined : placeholder}
      spellCheck={!readOnly}
      onInput={(e) => onChange(e.currentTarget.innerText.replace(/\n$/, ''))}
      onKeyDown={onKeyDown}
      onBlur={onBlur && ((e) => onBlur(e.currentTarget.innerText))}
    />
  )
}
