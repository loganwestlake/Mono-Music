import { useState } from 'react'
import { usePlayerTime } from '../player/PlayerProvider'
import { formatTime } from '../lib/tracks'

/** Hairline progress bar you can drag to seek. */
export default function Scrubber({ onSeek, disabled, showTimes = true, className = '' }) {
  const { time, duration } = usePlayerTime()
  const [drag, setDrag] = useState(null)
  const value = drag ?? time
  const pct = duration ? Math.min(100, (value / duration) * 100) : 0

  return (
    <div className={className}>
      <input
        type="range"
        aria-label="Seek"
        min={0}
        max={duration || 1}
        step={0.1}
        value={Math.min(value, duration || 1)}
        disabled={disabled || !duration}
        onChange={(e) => setDrag(Number(e.target.value))}
        onPointerUp={() => {
          if (drag != null) onSeek(drag)
          setDrag(null)
        }}
        onKeyUp={() => {
          if (drag != null) onSeek(drag)
          setDrag(null)
        }}
        className="mono-range w-full"
        style={{ '--pct': `${pct}%` }}
      />
      {showTimes && (
        <div className="mt-1 flex justify-between text-[10px] font-bold tracking-widest text-neutral-400 tabular-nums">
          <span>{formatTime(value)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      )}
    </div>
  )
}
