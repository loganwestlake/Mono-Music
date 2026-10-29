import { useState } from 'react'
import { BLOBS } from '../lib/shapes'
import { isUnresolved, thumbUrl } from '../lib/tracks'

/**
 * Grayscale image with a monogram fallback. Pass `track` (YouTube artwork)
 * or `src` + `name`. Shapes: square | circle | blob-a … blob-d.
 */
export default function Artwork({ track, src, name, shape = 'square', className = '', imgClassName = '' }) {
  const [failed, setFailed] = useState(false)
  const url = src ?? track?.cover ?? (track && !isUnresolved(track) ? thumbUrl(track.id) : null)
  const isYouTubeThumb = !src && !track?.cover && !!track
  const label = name ?? track?.title ?? ''

  const radius = shape.startsWith('blob-') ? BLOBS[shape.slice(5)] : undefined
  const shapeClass = shape === 'circle' ? 'rounded-full' : shape === 'square' ? 'rounded-md' : ''

  return (
    <div
      className={`@container relative overflow-hidden bg-neutral-300 ${shapeClass} ${className}`}
      style={radius ? { borderRadius: radius } : undefined}
    >
      {url && !failed ? (
        <img
          src={url}
          alt=""
          loading="lazy"
          draggable={false}
          onError={() => setFailed(true)}
          // YouTube thumbnails are 4:3 with letterbox bars; scale crops them out.
          className={`h-full w-full object-cover grayscale contrast-[1.1] ${isYouTubeThumb ? 'scale-[1.35]' : ''} ${imgClassName}`}
        />
      ) : (
        <div className="grid h-full w-full place-items-center bg-[#111] text-white">
          <span className="text-[30cqw] font-black tracking-tight uppercase">{initials(label)}</span>
        </div>
      )}
    </div>
  )
}

function initials(name = '') {
  return (
    name
      .replace(/[^\p{L}\p{N}\s]/gu, '')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0])
      .join('') || '♪'
  )
}
