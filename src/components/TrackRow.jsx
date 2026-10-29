import { AnimatePresence, motion } from 'framer-motion'
import { Heart, Link2, ListEnd, ListPlus, ListStart, MoreHorizontal, Radio, Share2, Trash2, User } from 'lucide-react'
import { usePlayer } from '../player/PlayerProvider'
import { useLibrary } from '../store/library'
import { useToast } from '../store/toast'
import { navigate } from '../lib/router'
import { formatTime, youtubeUrl } from '../lib/tracks'
import { useAddToPlaylist } from './AddToPlaylist'
import Artwork from './Artwork'
import Menu from './Menu'

/**
 * One song in a list. Clicking plays the whole list from this row.
 * `onRemove` adds a "Remove" item (used inside playlists).
 */
export default function TrackRow({ track, list, index, number, onRemove }) {
  const player = usePlayer()
  const isCurrent = player.current?.id === track.id

  const play = () => (list ? player.playTracks(list, index) : player.playTrack(track))

  return (
    <li
      className={`group relative flex items-center gap-3 rounded-xl px-2 py-2 transition-colors md:gap-4 ${
        isCurrent ? 'bg-black/[0.05]' : 'hover:bg-black/[0.04]'
      }`}
    >
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
        <span className="hidden text-[11px] font-medium text-neutral-400 tabular-nums sm:block">{formatTime(track.duration)}</span>
      )}
      <LikeButton track={track} />
      <TrackMenu track={track} onRemove={onRemove} />
    </li>
  )
}

/** Heart with a little burst when you like something. */
export function LikeButton({ track, size = 17, alwaysVisible }) {
  const { isLiked, toggleLike } = useLibrary()
  const liked = isLiked(track.id)
  return (
    <motion.button
      type="button"
      aria-label={liked ? 'Remove from Liked Songs' : 'Add to Liked Songs'}
      title={liked ? 'Remove from Liked Songs' : 'Add to Liked Songs'}
      onClick={() => toggleLike(track)}
      whileTap={{ scale: 0.8 }}
      className={`relative grid h-9 w-9 shrink-0 place-items-center rounded-full text-[#111] hover:bg-black/5 ${
        liked || alwaysVisible ? '' : 'opacity-0 group-hover:opacity-100 focus:opacity-100 max-md:opacity-100'
      }`}
    >
      <motion.span key={liked ? 'on' : 'off'} initial={{ scale: liked ? 0.4 : 1 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 500, damping: 12 }}>
        <Heart size={size} strokeWidth={1.25} fill={liked ? 'currentColor' : 'none'} />
      </motion.span>
      <AnimatePresence>
        {liked && (
          <motion.span
            key="burst"
            className="pointer-events-none absolute inset-0 rounded-full border border-[#111]"
            initial={{ scale: 0.4, opacity: 0.8 }}
            animate={{ scale: 1.6, opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
          />
        )}
      </AnimatePresence>
    </motion.button>
  )
}

export function TrackMenu({ track, onRemove, className = '' }) {
  const player = usePlayer()
  const toast = useToast()
  const openAddToPlaylist = useAddToPlaylist()

  const share = async () => {
    const url = youtubeUrl(track)
    const text = `${track.title} — ${track.artist}`
    if (navigator.share) {
      try {
        await navigator.share({ title: text, text, url })
        return
      } catch {
        // cancelled → fall through to copy
      }
    }
    navigator.clipboard?.writeText(`${text} ${url}`)
    toast('Link copied')
  }

  return (
    <Menu
      icon={MoreHorizontal}
      label="More options"
      size={18}
      className={className}
      items={[
        { icon: ListStart, label: 'Play next', run: () => player.playNext(track) },
        { icon: ListEnd, label: 'Add to queue', run: () => player.enqueue(track) },
        { icon: ListPlus, label: 'Add to playlist', run: () => openAddToPlaylist(track) },
        'divider',
        { icon: Radio, label: 'Start radio', run: () => player.startRadio(track) },
        { icon: User, label: 'Go to artist', run: () => navigate(`/artist/${encodeURIComponent(track.artist)}`) },
        { icon: Share2, label: 'Share', run: share },
        {
          icon: Link2,
          label: 'Copy YouTube link',
          run: () => {
            navigator.clipboard?.writeText(youtubeUrl(track))
            toast('Link copied')
          },
        },
        onRemove && 'divider',
        onRemove && { icon: Trash2, label: 'Remove from playlist', run: onRemove },
      ]}
    />
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
