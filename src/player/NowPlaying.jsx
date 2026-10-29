import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ChevronDown,
  Heart,
  ListMusic,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume1,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react'
import ScallopedPlayer from '../components/ScallopedPlayer'
import Scrubber from '../components/Scrubber'
import Artwork from '../components/Artwork'
import { TrackMenu } from '../components/TrackRow'
import { Eyebrow, IconButton, Spinner } from '../components/ui'
import { fetchLyrics } from '../lib/lyrics'
import { formatTime } from '../lib/tracks'
import { useLibrary } from '../store/library'
import { usePlayer, usePlayerTime } from './PlayerProvider'

/**
 * The "Now Playing" view. Rendered exactly once for the app's lifetime
 * (it hosts the YouTube iframe): docked as a right-hand column on wide
 * screens, otherwise a full-screen sheet that slides up over the app.
 */
export default function NowPlaying({ docked, open, onClose }) {
  const player = usePlayer()
  const { isLiked, toggleLike } = useLibrary()
  const track = player.current
  const visible = docked || open
  const liked = track && isLiked(track.id)

  return (
    <motion.aside
      aria-label="Now playing"
      aria-hidden={!visible}
      inert={!visible}
      initial={false}
      animate={{ y: visible ? 0 : '100%' }}
      transition={{ type: 'spring', damping: 32, stiffness: 300 }}
      className={
        docked
          ? 'no-scrollbar relative h-full overflow-y-auto border-l border-black/10 bg-[#F2F2F2] xl:col-start-3 xl:row-span-2 xl:row-start-1'
          : 'no-scrollbar fixed inset-0 z-50 overflow-y-auto bg-[#F2F2F2]'
      }
    >
      <div className="mx-auto flex min-h-full max-w-[480px] flex-col">
        <header className="grid grid-cols-[44px_1fr_44px] items-center px-4 pt-[max(env(safe-area-inset-top),16px)]">
          <div>{!docked && <IconButton icon={ChevronDown} label="Close player" onClick={onClose} />}</div>
          <h2 className="text-center text-[11px] font-semibold uppercase tracking-widest">Current Track</h2>
          <div>
            {track && (
              <IconButton
                icon={Heart}
                label={liked ? 'Remove from Liked Songs' : 'Add to Liked Songs'}
                fill={liked ? 'currentColor' : 'none'}
                onClick={() => toggleLike(track)}
                dot={false}
              />
            )}
          </div>
        </header>

        <main className="flex flex-col items-center px-6">
          <Timestamps />

          <ScallopedPlayer
            mountRef={player.mountRef}
            track={track}
            playing={player.playing}
            className={`mt-6 ${docked ? 'w-[min(280px,80%)]' : 'w-[min(300px,76vw)]'}`}
          />

          <StatusLine />

          <TrackInfo track={track} docked={docked} />

          <Scrubber onSeek={player.seek} disabled={!track} showTimes={false} className="mt-6 w-full max-w-[340px]" />

          <Controls />

          <VolumeControl />
        </main>

        <Lyrics track={track} />
        <UpNext />
      </div>
    </motion.aside>
  )
}

function Timestamps() {
  const { time, duration } = usePlayerTime()
  return (
    <Eyebrow className="mt-6 tabular-nums">
      {formatTime(time)} / {formatTime(duration)}
    </Eyebrow>
  )
}

function StatusLine() {
  const { status, error, buffering, current } = usePlayer()
  let text = null
  if (status === 'blocked')
    text = 'YouTube couldn’t load. It may be blocked on this network, by your school/work device, or by an ad-blocker.'
  else if (error) text = error
  else if (current && (status === 'loading' || buffering)) text = <Spinner className="text-neutral-400" />
  return <div className="mt-4 flex min-h-5 max-w-[300px] justify-center text-center text-[11px] text-neutral-500">{text}</div>
}

function TrackInfo({ track, docked }) {
  const title = track?.title ?? 'Nothing playing'
  const size = title.length > 28 ? 'text-[26px]' : title.length > 16 ? 'text-[32px]' : docked ? 'text-[36px]' : 'text-[40px]'
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={track?.id ?? 'empty'}
        className="mt-4 w-full text-center"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      >
        <h3 className={`line-clamp-2 leading-[0.95] font-black tracking-tight text-[#111] uppercase ${size}`}>{title}</h3>
        <Eyebrow className="mt-3 truncate">{track ? track.artist : 'Search for a song to begin'}</Eyebrow>
      </motion.div>
    </AnimatePresence>
  )
}

function Controls() {
  const p = usePlayer()
  const disabled = !p.current
  return (
    <div className="mt-6 flex w-full max-w-[340px] items-center justify-between">
      <IconButton icon={Shuffle} label="Shuffle" active={p.shuffle} onClick={p.toggleShuffle} size={18} />
      <IconButton icon={SkipBack} label="Previous" onClick={p.prev} size={22} disabled={disabled} />
      <PlayButton size="lg" />
      <IconButton icon={SkipForward} label="Next" onClick={p.next} size={22} disabled={disabled} />
      <IconButton
        icon={p.repeat === 'one' ? Repeat1 : Repeat}
        label={`Repeat: ${p.repeat}`}
        active={p.repeat !== 'off'}
        onClick={p.cycleRepeat}
        size={18}
      />
    </div>
  )
}

export function PlayButton({ size = 'lg' }) {
  const p = usePlayer()
  const lg = size === 'lg'
  return (
    <motion.button
      type="button"
      aria-label={p.playing ? 'Pause' : 'Play'}
      title={p.playing ? 'Pause (Space)' : 'Play (Space)'}
      onClick={p.toggle}
      disabled={!p.current || p.status !== 'ready'}
      whileTap={{ scale: 0.92 }}
      className={`grid shrink-0 place-items-center rounded-full bg-[#111] text-white disabled:opacity-40 ${
        lg ? 'h-[76px] w-[76px] shadow-[0_12px_30px_-10px_rgba(0,0,0,0.6)]' : 'h-11 w-11'
      }`}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={p.playing ? 'pause' : 'play'}
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.6 }}
          transition={{ duration: 0.12 }}
          className="grid place-items-center"
        >
          {p.playing ? (
            <Pause size={lg ? 26 : 18} strokeWidth={1.25} fill="currentColor" />
          ) : (
            <Play size={lg ? 26 : 18} strokeWidth={1.25} fill="currentColor" className="translate-x-[1px]" />
          )}
        </motion.span>
      </AnimatePresence>
    </motion.button>
  )
}

export function VolumeControl({ className = 'mt-4 hidden w-full max-w-[220px] items-center gap-2 [@media(hover:hover)]:flex' }) {
  const p = usePlayer()
  const level = p.muted ? 0 : p.volume
  const Icon = level === 0 ? VolumeX : level < 50 ? Volume1 : Volume2
  return (
    <div className={className}>
      <IconButton icon={Icon} label={p.muted ? 'Unmute' : 'Mute'} onClick={p.toggleMute} size={16} className="h-8 w-8" />
      <input
        type="range"
        aria-label="Volume"
        min={0}
        max={100}
        value={level}
        onChange={(e) => p.setVolume(Number(e.target.value))}
        className="mono-range flex-1"
        style={{ '--pct': `${level}%` }}
      />
    </div>
  )
}

/* ── Lyrics ─────────────────────────────────────────────────────────── */

function Lyrics({ track }) {
  const [expanded, setExpanded] = useState(false)
  const [state, setState] = useState({ id: null, loading: false, data: null })
  const { time } = usePlayerTime()
  const { seek } = usePlayer()
  const listRef = useRef(null)

  useEffect(() => {
    if (!track || track.pending) return setState({ id: null, loading: false, data: null })
    let alive = true
    setState({ id: track.id, loading: true, data: null })
    fetchLyrics(track).then((data) => alive && setState({ id: track.id, loading: false, data }))
    return () => {
      alive = false
    }
  }, [track?.id, track?.title, track?.pending]) // eslint-disable-line react-hooks/exhaustive-deps

  const lines = state.data?.lines ?? []
  const synced = state.data?.synced
  const current = useMemo(() => {
    if (!synced) return -1
    let i = -1
    for (let n = 0; n < lines.length; n++) if (time + 0.3 >= lines[n].at) i = n
    return i
  }, [lines, synced, time])

  // Keep the active line in view when expanded.
  useEffect(() => {
    if (!expanded || current < 0) return
    listRef.current?.children[current]?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [current, expanded])

  if (!track) return null

  const preview = synced ? lines.slice(Math.max(0, current), Math.max(0, current) + 3) : lines.slice(0, 3)
  const visible = expanded ? lines : preview

  return (
    <section className="mt-8 border-t border-black/10 px-6 pt-5 pb-4">
      <div className="flex items-center justify-between">
        <Eyebrow className="text-[#111]">Lyrics</Eyebrow>
        {lines.length > 3 && (
          <IconButton
            icon={expanded ? Minimize2 : Maximize2}
            label={expanded ? 'Collapse lyrics' : 'Expand lyrics'}
            onClick={() => setExpanded((e) => !e)}
            size={16}
            className="-mr-3 h-9 w-9"
          />
        )}
      </div>

      {state.loading ? (
        <p className="mt-2 text-[15px] text-neutral-400">Finding lyrics…</p>
      ) : lines.length === 0 ? (
        <p className="mt-2 text-[15px] text-neutral-400">{track.pending ? 'Loading track…' : 'No lyrics found for this track.'}</p>
      ) : (
        <ul
          ref={listRef}
          className={`no-scrollbar mt-2 space-y-2 ${expanded ? 'max-h-[50vh] overflow-y-auto py-2' : ''}`}
        >
          {visible.map((line, n) => {
            const i = expanded ? n : lines.indexOf(line)
            const isCurrent = synced ? i === current : false
            return (
              <li
                key={`${line.at}-${i}`}
                onClick={synced ? () => seek(line.at) : undefined}
                className={`text-[17px] leading-snug tracking-tight transition-colors duration-500 ${
                  synced ? 'cursor-pointer' : ''
                } ${isCurrent || (!synced && !expanded && n === 0) ? 'font-bold text-[#111]' : 'font-medium text-neutral-400/80'}`}
              >
                {line.text}
              </li>
            )
          })}
        </ul>
      )}
      {lines.length > 0 && <p className="mt-4 text-[9px] uppercase tracking-widest text-neutral-400">Lyrics via LRCLIB</p>}
    </section>
  )
}

/* ── Queue ──────────────────────────────────────────────────────────── */

function UpNext() {
  const p = usePlayer()
  const [all, setAll] = useState(false)
  const upcoming = p.queue.slice(p.index + 1)
  if (!p.current) return null
  const shown = all ? upcoming : upcoming.slice(0, 5)

  return (
    <section className="border-t border-black/10 px-6 pt-5 pb-[max(env(safe-area-inset-bottom),32px)]">
      <div className="mb-2 flex items-center justify-between">
        <Eyebrow className="flex items-center gap-2 text-[#111]">
          <ListMusic size={13} strokeWidth={1.5} /> Up next · {upcoming.length}
        </Eyebrow>
        {upcoming.length > 0 && (
          <button
            type="button"
            onClick={p.clearUpcoming}
            className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 hover:text-[#111]"
          >
            Clear
          </button>
        )}
      </div>
      {upcoming.length === 0 ? (
        <p className="py-2 text-[13px] text-neutral-400">The queue is empty. Add songs with “Add to queue”.</p>
      ) : (
        <ul>
          {shown.map((t, n) => {
            const i = p.index + 1 + n
            return (
              <li key={`${t.id}-${i}`} className="group flex items-center gap-3 rounded-xl py-1.5 hover:bg-black/[0.04]">
                <button type="button" onClick={() => p.jump(i)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                  <Artwork track={t} className="h-10 w-10 shrink-0" />
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-semibold tracking-tight">{t.title}</span>
                    <span className="block truncate text-[11px] text-neutral-400">{t.artist}</span>
                  </span>
                </button>
                <IconButton icon={X} label="Remove from queue" onClick={() => p.removeAt(i)} size={14} className="h-8 w-8" />
                <TrackMenu track={t} />
              </li>
            )
          })}
        </ul>
      )}
      {upcoming.length > 5 && (
        <button
          type="button"
          onClick={() => setAll((a) => !a)}
          className="mt-2 text-[10px] font-bold uppercase tracking-widest text-neutral-400 hover:text-[#111]"
        >
          {all ? 'Show less' : `Show all ${upcoming.length}`}
        </button>
      )}
    </section>
  )
}
