import { useEffect, useRef, useState } from 'react'
import { Volume2, VolumeX } from 'lucide-react'
import { useBlobUrl } from '../../hooks/useBlobUrl'
import type { MediaItem } from '../../types'

/** Plays only while on screen, so a board full of videos stays light. */
function BoardVideo({ src }: { src: string }) {
  const ref = useRef<HTMLVideoElement>(null)
  const [muted, setMuted] = useState(true)

  useEffect(() => {
    const video = ref.current
    if (!video) return
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) video.play().catch(() => {})
      else video.pause()
    })
    observer.observe(video)
    return () => observer.disconnect()
  }, [src])

  return (
    <>
      <video ref={ref} className="cover" src={src} muted={muted} loop playsInline preload="metadata" />
      <button
        className="chip chip-dark corner"
        onClick={(e) => {
          e.stopPropagation()
          setMuted((m) => !m)
        }}
        aria-label={muted ? 'Unmute' : 'Mute'}
      >
        {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
      </button>
    </>
  )
}

export function MediaCard({ item }: { item: MediaItem }) {
  const url = useBlobUrl(item.blobId)
  if (!url) return <div className="skeleton fill" />
  if (item.kind === 'image') return <img className="cover" src={url} alt="" draggable={false} />
  return <BoardVideo src={url} />
}
