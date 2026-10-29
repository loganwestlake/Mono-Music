import { AnimatePresence, motion } from 'framer-motion'
import {
  ChevronUp,
  Heart,
  ListMusic,
  MicVocal,
  PanelRight,
  PictureInPicture2,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
} from 'lucide-react'
import Artwork from '../components/Artwork'
import Scrubber from '../components/Scrubber'
import { IconButton } from '../components/ui'
import { href } from '../lib/router'
import { formatTime } from '../lib/tracks'
import { useLibrary } from '../store/library'
import { useUi } from '../store/ui'
import { useMiniWindow } from './MiniWindow'
import { PlayButton, VolumeControl } from './NowPlaying'
import { usePlayer, usePlayerTime } from './PlayerProvider'

/**
 * Spotify-style "now playing" bar pinned to the bottom of every screen.
 * Phones get a compact version (tap to open the full player); larger
 * screens get track info · transport + seek bar · extras.
 */
export default function PlayerBar({ docked }) {
  const p = usePlayer()
  const ui = useUi()
  const mini = useMiniWindow()
  const { isLiked, toggleLike } = useLibrary()
  const track = p.current
  if (!track) return null
  const liked = isLiked(track.id)
  const open = () => (docked ? !ui.panel && ui.togglePanel() : ui.setSheetOpen(true))

  return (
    <div className="relative z-30 border-t border-black/10 bg-[#F2F2F2]/90 backdrop-blur-xl md:col-span-full">
      <MobileProgress />

      {/* Phone */}
      <div className="flex items-center gap-3 px-3 py-2 md:hidden">
        <button type="button" onClick={open} className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-label="Open player">
          <Artwork track={track} shape="circle" className={`h-11 w-11 shrink-0 ${p.playing ? 'animate-[spin_12s_linear_infinite]' : ''}`} />
          <span className="min-w-0">
            <span className="block truncate text-[14px] font-bold tracking-tight">{track.title}</span>
            <BarSubtitle />
          </span>
        </button>
        <AdChip compact />
        <PlayButton size="sm" />
        <IconButton icon={SkipForward} label="Next" onClick={p.next} size={18} />
      </div>

      {/* Tablet / desktop */}
      <div className="hidden grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,1fr)] items-center gap-6 px-4 py-3 md:grid">
        <div className="flex min-w-0 items-center gap-3">
          <button type="button" onClick={open} aria-label="Open player" className="shrink-0">
            <Artwork track={track} className="h-14 w-14 rounded-lg shadow-[0_8px_20px_-10px_rgba(0,0,0,0.5)]" />
          </button>
          <div className="min-w-0">
            <button type="button" onClick={open} className="block max-w-full truncate text-left text-[14px] font-bold tracking-tight hover:underline">
              {track.title}
            </button>
            <a
              href={href(`/artist/${encodeURIComponent(track.artist)}`)}
              className="block truncate text-[11px] font-semibold uppercase tracking-widest text-neutral-400 hover:text-[#111]"
            >
              {track.artist}
            </a>
          </div>
          <IconButton
            icon={Heart}
            label={liked ? 'Remove from Liked Songs' : 'Add to Liked Songs'}
            fill={liked ? 'currentColor' : 'none'}
            dot={false}
            onClick={() => toggleLike(track)}
            size={16}
            className="h-9 w-9"
          />
        </div>

        <div className="flex flex-col items-center">
          <div className="flex items-center gap-2">
            <IconButton icon={Shuffle} label="Shuffle" active={p.shuffle} onClick={p.toggleShuffle} size={16} className="h-9 w-9" />
            <IconButton icon={SkipBack} label="Previous" onClick={p.prev} size={18} className="h-9 w-9" />
            <PlayButton size="sm" />
            <IconButton icon={SkipForward} label="Next" onClick={p.next} size={18} className="h-9 w-9" />
            <IconButton
              icon={p.repeat === 'one' ? Repeat1 : Repeat}
              label={`Repeat: ${p.repeat}`}
              active={p.repeat !== 'off'}
              onClick={p.cycleRepeat}
              size={16}
              className="h-9 w-9"
            />
          </div>
          <InlineScrubber />
        </div>

        <div className="flex items-center justify-end gap-0.5">
          <AdChip />
          <IconButton icon={MicVocal} label="Lyrics (Y)" onClick={() => ui.setLyricsOpen(true)} size={16} className="h-9 w-9" />
          <IconButton
            icon={ListMusic}
            label="Queue"
            onClick={() => (docked ? ui.togglePanel() : ui.setSheetOpen(true))}
            size={16}
            className="h-9 w-9"
          />
          <IconButton
            icon={PictureInPicture2}
            label={mini.isOpen ? 'Close mini player' : 'Pop-out mini player'}
            active={mini.isOpen}
            onClick={mini.isOpen ? mini.close : mini.open}
            size={16}
            className="h-9 w-9"
          />
          <VolumeControl className="ml-1 hidden w-32 items-center gap-1 lg:flex" />
          {docked ? (
            <IconButton icon={PanelRight} label="Now Playing view" active={ui.panel} onClick={ui.togglePanel} size={16} className="h-9 w-9" />
          ) : (
            <IconButton icon={ChevronUp} label="Open player" onClick={open} size={18} className="h-9 w-9" />
          )}
        </div>
      </div>
    </div>
  )
}

function BarSubtitle() {
  const p = usePlayer()
  const { ad } = usePlayerTime()
  const text = ad ? `Ad · ${formatTime(ad.remaining)} left` : p.resolving ? 'Finding song…' : (p.error ?? p.current.artist)
  return <span className="block truncate text-[10px] font-bold uppercase tracking-widest text-neutral-400">{text}</span>
}

function InlineScrubber() {
  const p = usePlayer()
  const { time, duration, ad } = usePlayerTime()
  return (
    <div className="mt-1 flex w-full max-w-[560px] items-center gap-3 text-[10px] font-bold tracking-widest text-neutral-400 tabular-nums">
      <span className="w-10 text-right">{formatTime(ad ? 0 : time)}</span>
      <Scrubber onSeek={p.seek} disabled={!!ad} showTimes={false} className="flex-1" />
      <span className="w-10">{formatTime(duration)}</span>
    </div>
  )
}

function MobileProgress() {
  const { time, duration } = usePlayerTime()
  const pct = duration ? (time / duration) * 100 : 0
  return (
    <div className="absolute inset-x-0 top-0 h-[2px] bg-black/5 md:hidden">
      <div className="h-full bg-[#111] transition-[width] duration-300 ease-linear" style={{ width: `${pct}%` }} />
    </div>
  )
}

/**
 * Shown while a YouTube ad plays (only possible when no ad-free copy was
 * found). Counts down; after 5 seconds offers to skip by switching the
 * song to an ad-free source.
 */
export function AdChip({ compact }) {
  const { ad } = usePlayerTime()
  const { skipAd } = usePlayer()
  return (
    <AnimatePresence>
      {ad && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          className="mr-2 flex shrink-0 items-center gap-2 rounded-full bg-[#111] py-1 pr-1 pl-3 text-[10px] font-bold uppercase tracking-widest text-white"
        >
          <span className="tabular-nums">{compact ? formatTime(ad.remaining) : `Ad · ${formatTime(ad.remaining)} left`}</span>
          {ad.elapsed >= 5 ? (
            <button type="button" onClick={skipAd} className="rounded-full bg-white px-2.5 py-1 text-[#111]">
              Skip
            </button>
          ) : (
            <span className="rounded-full bg-white/15 px-2.5 py-1 tabular-nums">Skip in {Math.ceil(5 - ad.elapsed)}</span>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
