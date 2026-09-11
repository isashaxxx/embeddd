import { createContext, useContext } from 'react'
import { getBlobUrl } from './storage'

/** Where a board renders: the owner's editable copy, or a read-only public snapshot. */
export interface BoardEnv {
  readOnly: boolean
  /** Live embeds (players, Figma/Miro previews); off for demo boards with placeholder links. */
  allowEmbeds?: boolean
  blobUrl: (id: string) => Promise<string | undefined> | string
}

export const BoardEnvContext = createContext<BoardEnv>({ readOnly: false, blobUrl: getBlobUrl })

export const useBoardEnv = () => useContext(BoardEnvContext)
