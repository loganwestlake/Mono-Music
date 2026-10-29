import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Heart, ListEnd, ListPlus, ListStart, MoreHorizontal, Trash2 } from 'lucide-react'
import { usePlayer } from '../player/PlayerProvider'
import { useLibrary } from '../store/library'
import { formatTime } from '../lib/tracks'
import { useAddToPlaylist } from './AddToPlaylist'
import Artwork from './Artwork'
import { IconButton } from './ui'

/**
 * One song in a list. Clicking plays the whole list from this row.
 * `onRemove` adds a "Remove" item (used inside playlists).
 */
export default function TrackRow({ track, list, index, number, onRemove }) {
  const player = usePlayer()
  const { isLiked, toggleLike } = useLibrary()
  const isCurrent = player.current?.id === track.id
  const liked = isLiked(track.id)

  const play = () => (list ? player.playTracks(list, index) : player.playTrack(track))

  return (
    <li className="group relative flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-black/[0.04] md:gap-4">
      {number != null && (
        <span className="hidden w-6 text-right text-[11px] font-semibold text-neutral-400 tabular-nums md:block">
          {isCurrent && player.playing ? <Equalizer /> : number}
        </span>
      )}
      <button type="button" onClick={play} className="flex min-w-0 flex-1 items-center gap-3 text-left md:gap-4">
        <Artwork track={track} className="h-12 w-12 shrink-0" />
        <span className="min-w-0">
          <span className={`block truncate text-[14px] tracking-tight ${isCurrent ? 'font-black' : 'font-semibold'}`}>
            {track.title}
          </span>
          <span className="block truncate text-[12px] text-neutral-400">{track.artist}</span>
        </span>
      </button>
      {track.duration > 0 && (
        <span className="hidden text-[11px] font-medium text-neutral-400 tabular-nums sm:block">
          {formatTime(track.duration)}
        </span>
      )}
      <IconButton
        icon={Heart}
        label={liked ? 'Remove from Liked Songs' : 'Add to Liked Songs'}
        fill={liked ? 'currentColor' : 'none'}
        onClick={() => toggleLike(track)}
        size={17}
        className={`h-9 w-9 ${liked ? '' : 'opacity-0 group-hover:opacity-100 focus:opacity-100 max-md:opacity-100'}`}
      />
      <TrackMenu track={track} onRemove={onRemove} />
    </li>
  )
}

export function TrackMenu({ track, onRemove, className = '' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const player = usePlayer()
  const openAddToPlaylist = useAddToPlaylist()

  useEffect(() => {
    if (!open) return
    const close = (e) => !ref.current?.contains(e.target) && setOpen(false)
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const items = [
    { icon: ListStart, label: 'Play next', run: () => player.playNext(track) },
    { icon: ListEnd, label: 'Add to queue', run: () => player.enqueue(track) },
    { icon: ListPlus, label: 'Add to playlist', run: () => openAddToPlaylist(track) },
    onRemove && { icon: Trash2, label: 'Remove from playlist', run: onRemove },
  ].filter(Boolean)

  return (
    <div ref={ref} className={`relative ${className}`}>
      <IconButton icon={MoreHorizontal} label="More options" onClick={() => setOpen((o) => !o)} size={18} className="h-9 w-9" />
      <AnimatePresence>
        {open && (
          <motion.ul
            role="menu"
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute top-full right-0 z-40 mt-1 w-52 overflow-hidden rounded-2xl bg-[#111] p-1.5 text-white shadow-2xl"
          >
            {items.map(({ icon: Icon, label, run }) => (
              <li key={label}>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setOpen(false)
                    run()
                  }}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13px] font-medium hover:bg-white/10"
                >
                  <Icon size={16} strokeWidth={1.25} />
                  {label}
                </button>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  )
}

function Equalizer() {
  return (
    <span className="inline-flex h-3 items-end gap-[2px]" aria-label="Playing">
      {[0, 0.2, 0.4].map((d) => (
        <motion.span
          key={d}
          className="w-[2px] bg-[#111]"
          animate={{ height: ['30%', '100%', '45%'] }}
          transition={{ duration: 0.9, repeat: Infinity, repeatType: 'mirror', delay: d }}
        />
      ))}
    </span>
  )
}
