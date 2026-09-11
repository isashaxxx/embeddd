import { useEffect, useState } from 'react'
import { useBoardEnv } from '../lib/boardEnv'

export function useBlobUrl(id: string | undefined) {
  const { blobUrl } = useBoardEnv()
  const [url, setUrl] = useState<string>()
  useEffect(() => {
    let alive = true
    setUrl(undefined)
    if (id) Promise.resolve(blobUrl(id)).then((u) => alive && setUrl(u))
    return () => {
      alive = false
    }
  }, [id, blobUrl])
  return url
}
