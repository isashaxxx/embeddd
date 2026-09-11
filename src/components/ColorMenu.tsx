import { Check } from 'lucide-react'
import { BG_COLOR, colorName, NOTION_COLORS, TEXT_COLOR } from '../lib/blocks'
import type { NotionColor } from '../types'
import { Popover, type AnchorPosition } from './Popover'

interface Props {
  position: AnchorPosition
  color: NotionColor
  background: NotionColor
  onChange: (patch: { color?: NotionColor; background?: NotionColor }) => void
  onClose: () => void
}

/** Notion's color menu: one list of text colors, one of backgrounds. */
export function ColorMenu({ position, color, background, onChange, onClose }: Props) {
  return (
    <Popover position={position} className="popover color-menu" onClose={onClose}>
      <div className="color-section">Text color</div>
      {NOTION_COLORS.map((c) => (
        <button key={`t-${c}`} className="color-row" onClick={() => onChange({ color: c })}>
          <span className="color-swatch" style={{ color: TEXT_COLOR[c] }}>
            A
          </span>
          {c === 'default' ? 'Default text' : colorName(c)}
          {color === c && <Check size={14} className="color-check" />}
        </button>
      ))}
      <div className="color-section">Background color</div>
      {NOTION_COLORS.map((c) => (
        <button key={`b-${c}`} className="color-row" onClick={() => onChange({ background: c })}>
          <span className="color-swatch" style={{ background: BG_COLOR[c] }} />
          {c === 'default' ? 'Default background' : `${colorName(c)} background`}
          {background === c && <Check size={14} className="color-check" />}
        </button>
      ))}
    </Popover>
  )
}
