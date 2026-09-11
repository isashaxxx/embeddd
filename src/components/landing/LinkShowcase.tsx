import { useEffect, useState } from 'react'
import { photo } from '../../lib/landingDemo'
import { parseLink } from '../../lib/platforms'
import type { LinkItem } from '../../types'
import { LinkCard } from '../cards/LinkCard'
import { PlatformBadge } from '../PlatformBadge'

interface Example {
  typed: string
  item: LinkItem
}

const link = (url: string, fields: Partial<LinkItem>): LinkItem => ({
  id: url,
  kind: 'link',
  url,
  status: 'ready',
  size: 'M',
  createdAt: 0,
  ...fields,
})

const EXAMPLES: Example[] = [
  { typed: 'figma.com/design/brand-system', item: link('https://www.figma.com/design/brand-system', { title: 'Brand system v3', metaDescription: 'Figma', thumbId: photo(16) }) },
  { typed: 'pinterest.com/pin/red-knit', item: link('https://www.pinterest.com/pin/1/', { title: 'Red knit, white wall', author: 'studio.notes', thumbId: photo(18) }) },
  { typed: 'instagram.com/wardrobe.edit', item: link('https://www.instagram.com/wardrobe.edit/', { title: 'Wardrobe Edit (@wardrobe.edit)', metaDescription: '48.2K Followers, 310 Following', thumbId: photo(22) }) },
  { typed: 'notion.so/team/launch-wiki', item: link('https://www.notion.so/team/launch-wiki', { title: 'Launch wiki', metaDescription: 'notion.so', thumbId: photo(12) }) },
  { typed: 'tiktok.com/@maker/video/7', item: link('https://www.tiktok.com/@maker/video/7', { title: 'Five minute workshop tour', author: 'maker', thumbId: photo(21) }) },
  { typed: 'miro.com/app/board/journey', item: link('https://miro.com/app/board/journey/', { title: 'Customer journey', metaDescription: 'Miro', thumbId: photo(25) }) },
]

/** The landing's "paste a link" demo: a URL types itself, and its card slides into the middle. */
export function LinkShowcase() {
  const [index, setIndex] = useState(0)
  const [chars, setChars] = useState(0)
  const current = EXAMPLES[index]

  useEffect(() => {
    if (chars < current.typed.length) {
      const timer = setTimeout(() => setChars((c) => c + 1), 38)
      return () => clearTimeout(timer)
    }
    const timer = setTimeout(() => {
      setIndex((i) => (i + 1) % EXAMPLES.length)
      setChars(0)
    }, 2200)
    return () => clearTimeout(timer)
  }, [chars, current.typed.length])

  const platform = parseLink(current.item.url).platform

  return (
    <div className="showcase-panel">
      <div className="showcase-cards">
        {EXAMPLES.map((example, i) => {
          const offset = (i - index + EXAMPLES.length) % EXAMPLES.length
          // -1 = just left, 0 = center, 1 = next; the rest wait off-stage.
          const slot = offset === 0 ? 0 : offset === 1 ? 1 : offset === EXAMPLES.length - 1 ? -1 : 2
          return (
            <div key={example.typed} className={`showcase-card slot-${slot}`}>
              <div className="card size-M kind-link">
                <div className="card-body">
                  <LinkCard item={example.item} />
                </div>
              </div>
            </div>
          )
        })}
      </div>
      <div className="showcase-pill">
        <PlatformBadge platform={platform} shorts={platform === 'youtube'} size={26} />
        <span className="showcase-url">
          {current.typed.slice(0, chars)}
          <i className="caret" />
        </span>
        <span className="showcase-enter">↵</span>
      </div>
    </div>
  )
}
