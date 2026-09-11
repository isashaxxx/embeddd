import type { ReactNode } from 'react'
import { anchorFrom, Popover, type AnchorPosition } from './Popover'

export type MenuEntry = { label: string; icon?: ReactNode; danger?: boolean; onSelect: () => void } | 'separator'

export type MenuPosition = AnchorPosition
export const menuPositionFrom = anchorFrom

interface Props {
  position: MenuPosition
  entries: MenuEntry[]
  onClose: () => void
}

export function Menu({ position, entries, onClose }: Props) {
  return (
    <Popover position={position} className="menu" onClose={onClose}>
      <div role="menu">
        {entries.map((entry, i) =>
          entry === 'separator' ? (
            <div key={i} className="menu-sep" />
          ) : (
            <button
              key={i}
              role="menuitem"
              className={`menu-item${entry.danger ? ' danger' : ''}`}
              onClick={() => {
                onClose()
                entry.onSelect()
              }}
            >
              {entry.icon}
              {entry.label}
            </button>
          ),
        )}
      </div>
    </Popover>
  )
}
