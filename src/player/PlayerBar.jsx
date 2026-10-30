import { AnimatePresence, motion } from 'framer-motion'
import {
  ChevronUp,
  Heart,
  ListMusic,
  MicVocal,
  MonitorSpeaker,
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
import { useEffect, useState } from 'react'
import { Pause, Play, Speaker, Volume2 } from 'lucide-react'
import { useCloud } from '../store/cloud'
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
  const cloud = useCloud()
  const track = p.current

  // Spotify-style: if this device isn't playing but another of your
  // devices is, show (and control) that device's music here.
  if (!p.playing && !p.loading) {
    const others = (cloud?.devices || []).filter((d) => !d.me && d.online && d.state?.track)
    const remote = others.find((d) => d.state.playing) || (!track ? others[0] : null)
    if (remote) return <RemoteBar device={remote} />
  }
  if (!track) return null
  const liked = isLiked(track.id)
  const open = () => (docked ? !ui.panel && ui.togglePanel() : ui.setSheetOpen(true))

  return (
    <div className="relative z-30 px-2 pt-1 pb-1.5 md:col-span-full md:border-t md:border-black/10 md:bg-[#F2F2F2]/90 md:p-0 md:backdrop-blur-xl">
      {/* Phone: floating dark pill — tap to open, swipe sideways to skip */}
      <motion.div
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.5}
        onDragEnd={(_, info) => {
          if (info.offset.x < -70) p.next()
          else if (info.offset.x > 70) p.prev()
        }}
        className="relative overflow-hidden rounded-[22px] bg-[#111] text-white shadow-[0_14px_30px_-12px_rgba(0,0,0,0.55)] md:hidden"
      >
        <div className="flex items-center gap-3 py-2 pr-1.5 pl-2">
          <button type="button" onClick={open} className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-label="Open player">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.div
                key={track.id}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                className="shrink-0"
              >
                <Artwork track={track} className="h-11 w-11 rounded-xl" />
              </motion.div>
            </AnimatePresence>
            <span className="min-w-0">
              <span className="block truncate text-[14px] font-bold tracking-tight">{track.title}</span>
              <BarSubtitle light />
            </span>
          </button>
          <PlayButton size="sm" tone="light" />
          <IconButton icon={SkipForward} label="Next" onClick={p.next} size={20} tone="light" />
        </div>
        <MobileProgress />
      </motion.div>

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
          <IconButton icon={MonitorSpeaker} label="Devices" onClick={() => ui.setDevicesOpen(true)} size={16} className="h-9 w-9" />
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

function BarSubtitle({ light }) {
  const p = usePlayer()
  const { ad } = usePlayerTime()
  const text = ad ? 'Please wait…' : p.resolving ? 'Finding song…' : (p.error ?? p.current.artist)
  return (
    <span className={`block truncate text-[10px] font-bold uppercase tracking-widest ${light ? 'text-white/50' : 'text-neutral-400'}`}>
      {text}
    </span>
  )
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
  const { time, duration, ad } = usePlayerTime()
  const pct = !ad && duration ? (time / duration) * 100 : 0
  return (
    <div className="absolute inset-x-3 bottom-0 h-[2px] overflow-hidden rounded-full bg-white/15">
      <div className="h-full bg-white transition-[width] duration-300 ease-linear" style={{ width: `${pct}%` }} />
    </div>
  )
}

/**
 * Shown while a YouTube ad plays (only when no ad-free copy was found).
 * The ad is muted and hidden behind the artwork; the listener just sees
 * "Please wait" — the play button shows a spinner meanwhile.
 */
export function AdChip({ compact }) {
  const { ad } = usePlayerTime()
  return (
    <AnimatePresence>
      {ad && !compact && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          className="mr-2 flex shrink-0 items-center gap-2 rounded-full bg-[#111] px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-white"
        >
          <span className="h-3 w-3 animate-spin rounded-full border-[1.5px] border-white border-t-transparent" />
          Please wait…
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/* ── Remote: what another of your devices is playing ───────────────── */

function useRemotePosition(state) {
  const [, tick] = useState(0)
  useEffect(() => {
    if (!state?.playing) return
    const id = setInterval(() => tick((n) => n + 1), 500)
    return () => clearInterval(id)
  }, [state?.playing])
  const duration = state?.track?.duration || 0
  const elapsed = state?.playing ? (Date.now() - (state.at || Date.now())) / 1000 : 0
  const position = Math.max(0, Math.min(duration || Infinity, (state?.position || 0) + elapsed))
  return { position, duration }
}

/**
 * The player bar while music plays on another device (TV, phone, PC…):
 * same layout, but every control goes to that device, with a strip that
 * says where it's playing. Tap the strip for the Devices menu.
 */
function RemoteBar({ device }) {
  const cloud = useCloud()
  const ui = useUi()
  const s = device.state
  const track = s.track
  const { position, duration } = useRemotePosition(s)
  const send = (type, payload) => cloud.sendCommand(device.id, type, payload)
  const pct = duration ? (position / duration) * 100 : 0

  const toggle = (
    <motion.button
      type="button"
      whileTap={{ scale: 0.92 }}
      onClick={() => send('toggle')}
      aria-label={s.playing ? `Pause on ${device.name}` : `Play on ${device.name}`}
      className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#111] text-white md:h-11 md:w-11"
    >
      {s.playing ? <Pause size={18} strokeWidth={1.25} fill="currentColor" /> : <Play size={18} strokeWidth={1.25} fill="currentColor" className="translate-x-[1px]" />}
    </motion.button>
  )

  const strip = (
    <button
      type="button"
      onClick={() => ui.setDevicesOpen(true)}
      className="flex w-full items-center justify-end gap-2 bg-[#111] px-4 py-1.5 text-[11px] font-bold tracking-tight text-white max-md:justify-center max-md:rounded-b-[22px]"
    >
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
      <Speaker size={13} strokeWidth={1.75} />
      {s.playing ? 'Playing' : 'Paused'} on {device.name}
    </button>
  )

  return (
    <div className="relative z-30 px-2 pt-1 pb-1.5 md:col-span-full md:border-t md:border-black/10 md:bg-[#F2F2F2]/90 md:p-0 md:backdrop-blur-xl">
      {/* Phone */}
      <div className="overflow-hidden rounded-[22px] bg-white shadow-[0_14px_30px_-12px_rgba(0,0,0,0.45)] md:hidden">
        <div className="relative flex items-center gap-3 py-2 pr-1.5 pl-2">
          <button type="button" onClick={() => ui.setDevicesOpen(true)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
            <Artwork track={track} className="h-11 w-11 shrink-0 rounded-xl" />
            <span className="min-w-0">
              <span className="block truncate text-[14px] font-bold tracking-tight">{track.title}</span>
              <span className="block truncate text-[10px] font-bold uppercase tracking-widest text-neutral-400">{track.artist}</span>
            </span>
          </button>
          {toggle}
          <IconButton icon={SkipForward} label={`Next on ${device.name}`} onClick={() => send('next')} size={20} />
          <div className="absolute inset-x-3 bottom-0 h-[2px] overflow-hidden rounded-full bg-black/10">
            <div className="h-full bg-[#111] transition-[width] duration-500 ease-linear" style={{ width: `${pct}%` }} />
          </div>
        </div>
        {strip}
      </div>

      {/* Tablet / desktop */}
      <div className="hidden md:block">
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,1fr)] items-center gap-6 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <Artwork track={track} className="h-14 w-14 shrink-0 rounded-lg shadow-[0_8px_20px_-10px_rgba(0,0,0,0.5)]" />
            <div className="min-w-0">
              <p className="truncate text-[14px] font-bold tracking-tight">{track.title}</p>
              <a
                href={href(`/artist/${encodeURIComponent(track.artist)}`)}
                className="block truncate text-[11px] font-semibold uppercase tracking-widest text-neutral-400 hover:text-[#111]"
              >
                {track.artist}
              </a>
            </div>
          </div>

          <div className="flex flex-col items-center">
            <div className="flex items-center gap-2">
              <IconButton icon={SkipBack} label={`Previous on ${device.name}`} onClick={() => send('prev')} size={18} className="h-9 w-9" />
              {toggle}
              <IconButton icon={SkipForward} label={`Next on ${device.name}`} onClick={() => send('next')} size={18} className="h-9 w-9" />
            </div>
            <div className="mt-1 flex w-full max-w-[560px] items-center gap-3 text-[10px] font-bold tracking-widest text-neutral-400 tabular-nums">
              <span className="w-10 text-right">{formatTime(position)}</span>
              <input
                type="range"
                aria-label={`Seek on ${device.name}`}
                min={0}
                max={duration || 1}
                step={1}
                value={Math.min(position, duration || 1)}
                onChange={() => {}}
                onPointerUp={(e) => send('seek', { time: Number(e.currentTarget.value) })}
                onInput={(e) => e.currentTarget.style.setProperty('--pct', `${(Number(e.currentTarget.value) / (duration || 1)) * 100}%`)}
                className="mono-range min-w-0 flex-1"
                style={{ '--pct': `${pct}%` }}
              />
              <span className="w-10">{formatTime(duration)}</span>
            </div>
          </div>

          <div className="flex items-center justify-end gap-1">
            <IconButton icon={MonitorSpeaker} label="Devices" onClick={() => ui.setDevicesOpen(true)} size={16} className="h-9 w-9" />
            <label className="flex w-32 items-center gap-1">
              <Volume2 size={16} strokeWidth={1.25} className="shrink-0" />
              <input
                type="range"
                aria-label={`Volume on ${device.name}`}
                min={0}
                max={100}
                defaultValue={s.volume ?? 80}
                key={`${device.id}-${s.volume}`}
                onPointerUp={(e) => send('volume', { value: Number(e.currentTarget.value) })}
                className="mono-range min-w-0 flex-1"
                style={{ '--pct': `${s.volume ?? 80}%` }}
              />
            </label>
          </div>
        </div>
        {strip}
      </div>
    </div>
  )
}
