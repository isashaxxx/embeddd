import { useBoardEnv } from '../../lib/boardEnv'
import type { Item } from '../../types'
import { DocEditor } from '../DocEditor'
import { SketchCard } from '../sketch/Sketch'
import { WidgetCard } from '../widgets/Widgets'
import { FileCard } from './FileCard'
import { LinkCard } from './LinkCard'
import { MediaCard } from './MediaCard'

interface Props {
  item: Item
  autoFocus?: boolean
  onUpdate: (patch: Partial<Item>) => void
}

/** The inside of a card, shared by the board, Trash and anywhere else a card is shown. */
export function CardContent({ item, autoFocus, onUpdate }: Props) {
  const { readOnly } = useBoardEnv()
  switch (item.kind) {
    case 'text':
      return <DocEditor className="doc-card" blocks={item.blocks} autoFocus={autoFocus} onChange={(blocks) => onUpdate({ blocks })} />
    case 'image':
    case 'video':
      return <MediaCard item={item} />
    case 'file':
      return <FileCard item={item} />
    case 'link':
      return <LinkCard item={item} />
    case 'widget':
      return <WidgetCard item={item} onUpdate={onUpdate} />
    case 'sketch':
      return <SketchCard item={item} readOnly={readOnly} />
  }
}
