import { useRef, useState } from 'react'
import { AnimatePresence, motion, Reorder, useDragControls } from 'framer-motion'
import {
  ChevronDown,
  Expand,
  Flower2,
  Gauge,
  GripVertical,
  Heart,
  ListMusic,
  Maximize2,
  MicVocal,
  MonitorPlay,
  MonitorSpeaker,
  Moon,
  Pause,
  PictureInPicture2,
  Play,
  Radio,
  Repeat,
  Repeat1,
  Save,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume1,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react'
import Menu from '../components/Menu'
import ScallopedPlayer from '../components/ScallopedPlayer'
import Scrubber from '../components/Scrubber'
import Artwork from '../components/Artwork'
import { LikeButton, TrackMenu } from '../components/TrackRow'
import { Eyebrow, IconButton, Spinner } from '../components/ui'
import { href } from '../lib/router'
import { formatTime } from '../lib/tracks'
import { useLibrary } from '../store/library'
import { useToast } from '../store/toast'
import { useUi } from '../store/ui'
import { AdChip } from './PlayerBar'
import { useMiniWindow } from './MiniWindow'
import { usePlayer, usePlayerTime } from './PlayerProvider'
import { activeLineIndex, useLyrics, useTrackOffset } from './useLyrics'

/**
 * The "Now Playing" view. Rendered exactly once for the app's lifetime
 * (it hosts the YouTube iframe): docked as a right-hand column on wide
 * screens, otherwise a full-screen sheet that slides up over the app.
 */
export default function NowPlaying({ docked }) {
  const player = usePlayer()
  const { isLiked, toggleLike } = useLibrary()
  const track = player.current
  const { viewMode, panel, sheetOpen, setSheetOpen } = useUi()
  const onClose = () => setSheetOpen(false)
  const stageRef = useRef(null)
  const visible = docked ? panel : sheetOpen
  const liked = track && isLiked(track.id)

  // Cover the engine with artwork whenever it has nothing clean to show:
  // audio-only streams, and YouTube while paused (its pause screen has UI).
  const showVeil =
    !player.needsTap &&
    (!track ||
      !!player.ad ||
      (player.engine === 'stream' && !player.hasVideo) ||
      (!player.playing && (player.engine === 'youtube' || viewMode === 'art')))

  // Phone sheet: drag the top area (or the artwork) down to dismiss.
  const drag = useDragControls()
  const startDrag = (e) => !docked && drag.start(e)

  return (
    <motion.aside
      aria-label="Now playing"
      aria-hidden={!visible}
      inert={!visible}
      initial={false}
      animate={docked ? { x: visible ? 0 : '100%' } : { y: visible ? 0 : '100%' }}
      transition={{ type: 'spring', damping: 34, stiffness: 320 }}
      drag={docked ? false : 'y'}
      dragControls={drag}
      dragListener={false}
      dragConstraints={{ top: 0, bottom: 0 }}
      dragElastic={{ top: 0, bottom: 0.7 }}
      onDragEnd={(_, info) => (info.offset.y > 110 || info.velocity.y > 600) && onClose()}
      className={
        docked
          ? 'no-scrollbar relative h-full min-h-0 overflow-x-hidden overflow-y-auto border-l border-black/10 bg-[#F2F2F2] xl:col-start-3 xl:row-start-1'
          : 'no-scrollbar fixed inset-0 z-50 overflow-x-hidden overflow-y-auto overscroll-contain bg-[#F2F2F2]'
      }
    >
      <div className="mx-auto flex min-h-full max-w-[480px] flex-col">
        <header
          onPointerDown={startDrag}
          className={`grid grid-cols-[44px_1fr_44px] items-center px-4 ${
            docked ? 'pt-4' : 'touch-none pt-[max(env(safe-area-inset-top),10px)]'
          }`}
        >
          {!docked && <span aria-hidden className="col-span-3 mx-auto mb-1 h-1.5 w-10 rounded-full bg-black/15" />}
          <div>{!docked && <IconButton icon={ChevronDown} label="Close player" onClick={onClose} />}</div>
          <div className="text-center">
            <h2 className="text-[11px] font-semibold uppercase tracking-widest">{docked ? 'Current Track' : 'Now Playing'}</h2>
            {!docked && <Timestamps inline />}
          </div>
          <div>
            {track &&
              (docked ? (
                <IconButton
                  icon={Heart}
                  label={liked ? 'Remove from Liked Songs' : 'Add to Liked Songs'}
                  fill={liked ? 'currentColor' : 'none'}
                  onClick={() => toggleLike(track)}
                  dot={false}
                />
              ) : (
                <TrackMenu track={track} />
              ))}
          </div>
        </header>

        <main className="flex flex-col items-center px-6">
          {docked ? <Timestamps /> : null}

          <ScallopedPlayer
            ref={stageRef}
            mountRef={player.mountRef}
            track={track}
            playing={player.playing}
            mode={viewMode}
            showVeil={showVeil}
            interactive={player.needsTap}
            onPointerDown={startDrag}
            className={`${docked ? 'mt-6' : 'mt-8'} ${
              viewMode === 'video' ? 'w-full' : docked ? 'w-[min(280px,80%)]' : 'w-[min(86vw,380px)]'
            }`}
          />

          {player.needsTap && (
            <p className="mt-4 rounded-full bg-[#111] px-4 py-2 text-center text-[11px] font-semibold text-white">
              Tap the video once to start — iPhone needs a tap for this song
            </p>
          )}

          {docked ? (
            <>
              <div className="mt-3 flex h-8 items-center">
                <AdChip />
              </div>
              <Toolbar stageRef={stageRef} />
              <StatusLine />
              <TrackInfo track={track} docked={docked} />
              <Scrubber onSeek={player.seek} disabled={!track} showTimes={false} className="mt-6 w-full max-w-[340px]" />
              <Controls />
              <VolumeControl />
            </>
          ) : (
            <>
              <MobileTrackInfo track={track} />
              <Scrubber onSeek={player.seek} disabled={!track || !!player.ad} className="mt-5 w-full" />
              <Controls mobile />
              <StatusLine />
              <Toolbar stageRef={stageRef} mobile />
            </>
          )}
        </main>

        <Lyrics track={track} />
        <UpNext />
      </div>
    </motion.aside>
  )
}

/** Phone: big left-aligned title, artist link, like button — Apple Music style. */
function MobileTrackInfo({ track }) {
  const { ad } = usePlayerTime()
  return (
    <div className="mt-8 flex w-full items-end justify-between gap-3">
      <AnimatePresence mode="wait">
        <motion.div
          key={track?.id ?? 'empty'}
          className="min-w-0"
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -12 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        >
          <h3 className="line-clamp-2 text-[26px] leading-[1.02] font-black tracking-[-0.03em]">{track?.title ?? 'Nothing playing'}</h3>
          {track ? (
            <a
              href={href(`/artist/${encodeURIComponent(track.artist)}`)}
              className="mt-1 block truncate font-serif text-[19px] text-neutral-500 italic"
            >
              {ad ? 'Please wait…' : track.artist}
            </a>
          ) : (
            <p className="mt-1 font-serif text-[19px] text-neutral-500 italic">Search for a song to begin</p>
          )}
        </motion.div>
      </AnimatePresence>
      {track && <LikeButton track={track} size={22} alwaysVisible />}
    </div>
  )
}

/** Art / Video switch, fullscreen, lyrics, and pop-out mini player. */
function Toolbar({ stageRef, mobile }) {
  const { viewMode, setViewMode, setLyricsOpen, setDevicesOpen } = useUi()
  const mini = useMiniWindow()
  const p = usePlayer()

  const fullscreen = () => {
    const el = stageRef.current
    if (!el) return
    if (document.fullscreenElement) document.exitFullscreen()
    else el.requestFullscreen?.().catch(() => {})
  }

  return (
    <div
      className={
        mobile
          ? 'mt-6 mb-2 flex w-full items-center justify-between rounded-full bg-black/[0.04] px-2 py-1'
          : 'mt-2 flex flex-wrap items-center justify-center gap-1 rounded-[28px] border border-black/10 p-1'
      }
    >
      {mobile ? (
        <IconButton
          icon={viewMode === 'video' ? Flower2 : MonitorPlay}
          label={viewMode === 'video' ? 'Show artwork' : 'Show video'}
          onClick={() => setViewMode(viewMode === 'video' ? 'art' : 'video')}
          size={18}
          className="h-10 w-10"
        />
      ) : (
        <>
          <Segment active={viewMode === 'art'} onClick={() => setViewMode('art')} icon={Flower2} label="Art" />
          <Segment active={viewMode === 'video'} onClick={() => setViewMode('video')} icon={MonitorPlay} label="Video" />
          <span className="mx-1 h-5 w-px bg-black/10" />
        </>
      )}
      {viewMode === 'video' && (
        <IconButton icon={Expand} label="Full screen" onClick={fullscreen} size={16} className="h-9 w-9" disabled={!p.current} />
      )}
      <IconButton
        icon={MonitorSpeaker}
        label="Devices"
        onClick={() => setDevicesOpen(true)}
        size={mobile ? 18 : 16}
        className={mobile ? 'h-10 w-10' : 'h-9 w-9'}
      />
      <IconButton
        icon={MicVocal}
        label="Lyrics"
        onClick={() => setLyricsOpen(true)}
        size={mobile ? 18 : 16}
        className={mobile ? 'h-10 w-10' : 'h-9 w-9'}
        disabled={!p.current}
      />
      {!mobile && (
        <IconButton
          icon={PictureInPicture2}
          label={mini.isOpen ? 'Close mini player' : 'Pop-out mini player'}
          active={mini.isOpen}
          onClick={mini.isOpen ? mini.close : mini.open}
          size={16}
          className="h-9 w-9"
          disabled={!p.current}
        />
      )}
      <Menu
        icon={Radio}
        label="Radio"
        items={[
          { heading: 'Radio' },
          p.current && { icon: Radio, label: `Start ${p.current.artist} radio`, run: () => p.startRadio(p.current) },
        ]}
      />
      <Menu
        icon={Moon}
        label="Sleep timer"
        active={!!p.sleep}
        items={[
          { heading: 'Sleep timer' },
          ...[5, 15, 30, 45, 60].map((m) => ({ label: `${m} minutes`, run: () => p.setSleep(m) })),
          { label: 'End of this song', run: () => p.setSleep('track'), checked: !!p.sleep?.endOfTrack },
          p.sleep && 'divider',
          p.sleep && { label: 'Turn off', run: () => p.setSleep(null) },
        ]}
      />
      <Menu
        icon={Gauge}
        label="Playback speed"
        active={p.rate !== 1}
        items={[
          { heading: 'Speed' },
          ...[0.75, 0.9, 1, 1.1, 1.25, 1.5].map((r) => ({ label: `${r}×`, run: () => p.setRate(r), checked: p.rate === r })),
        ]}
      />
    </div>
  )
}

function Segment({ active, onClick, icon: Icon, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex h-9 items-center gap-1.5 rounded-full px-3 text-[10px] font-bold uppercase tracking-widest transition ${
        active ? 'bg-[#111] text-white' : 'text-[#111]/60 hover:text-[#111]'
      }`}
    >
      <Icon size={14} strokeWidth={1.5} />
      <span className="sr-only sm:not-sr-only">{label}</span>
    </button>
  )
}

function Timestamps({ inline }) {
  const { time, duration, ad } = usePlayerTime()
  if (inline)
    return (
      <p className="mt-0.5 truncate text-[10px] font-medium text-neutral-400">{ad ? 'Please wait…' : 'Mono Music'}</p>
    )
  return (
    <Eyebrow className="mt-6 tabular-nums">
      {ad ? 'Please wait…' : `${formatTime(time)} / ${formatTime(duration)}`}
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
        {track ? (
          <a
            href={href(`/artist/${encodeURIComponent(track.artist)}`)}
            className="mt-3 block truncate text-[10px] font-bold uppercase tracking-widest text-neutral-400 hover:text-[#111]"
          >
            {track.artist}
          </a>
        ) : (
          <Eyebrow className="mt-3">Search for a song to begin</Eyebrow>
        )}
      </motion.div>
    </AnimatePresence>
  )
}

function Controls({ mobile }) {
  const p = usePlayer()
  const disabled = !p.current
  return (
    <div className={`flex w-full items-center justify-between ${mobile ? 'mt-3 px-1' : 'mt-6 max-w-[340px]'}`}>
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

export function PlayButton({ size = 'lg', tone = 'dark' }) {
  const p = usePlayer()
  const lg = size === 'lg'
  const colors = tone === 'light' ? 'bg-white text-[#111]' : 'bg-[#111] text-white'
  return (
    <motion.button
      type="button"
      aria-label={p.loading ? 'Loading' : p.playing ? 'Pause' : 'Play'}
      title={p.loading ? 'Please wait…' : p.playing ? 'Pause (Space)' : 'Play (Space)'}
      onClick={p.toggle}
      disabled={!p.current || p.status !== 'ready' || !!p.ad}
      whileTap={{ scale: 0.92 }}
      className={`grid shrink-0 place-items-center rounded-full disabled:opacity-40 ${colors} ${
        lg ? 'h-[76px] w-[76px] shadow-[0_12px_30px_-10px_rgba(0,0,0,0.6)]' : 'h-11 w-11'
      }`}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={p.loading ? 'load' : p.playing ? 'pause' : 'play'}
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.6 }}
          transition={{ duration: 0.12 }}
          className="grid place-items-center"
        >
          {p.loading ? (
            <span
              aria-label="Loading"
              className={`animate-spin rounded-full border-2 border-current border-t-transparent ${lg ? 'h-7 w-7' : 'h-4 w-4'}`}
            />
          ) : p.playing ? (
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
        className="mono-range min-w-0 flex-1"
        style={{ '--pct': `${level}%` }}
      />
    </div>
  )
}

/* ── Lyrics preview (opens the full Apple-style view) ───────────────── */

function Lyrics({ track }) {
  const { loading, lines: all, synced } = useLyrics(track)
  const { time } = usePlayerTime()
  const offset = useTrackOffset(track)
  const { setLyricsOpen } = useUi()
  if (!track) return null

  const lines = all.filter((l) => l.text)
  const current = synced ? activeLineIndex(lines, time + offset.total) : -1
  const preview = synced ? lines.slice(Math.max(0, current), Math.max(0, current) + 3) : lines.slice(0, 3)

  return (
    <section className="mt-8 border-t border-black/10 px-6 pt-5 pb-4">
      <div className="flex items-center justify-between">
        <Eyebrow className="text-[#111]">Lyrics</Eyebrow>
        {lines.length > 0 && (
          <IconButton
            icon={Maximize2}
            label="Full-screen lyrics"
            onClick={() => setLyricsOpen(true)}
            size={16}
            className="-mr-3 h-9 w-9"
          />
        )}
      </div>

      {loading ? (
        <p className="mt-2 text-[15px] text-neutral-400">Finding lyrics…</p>
      ) : lines.length === 0 ? (
        <p className="mt-2 text-[15px] text-neutral-400">{track.pending ? 'Loading track…' : 'No lyrics found for this track.'}</p>
      ) : (
        <button type="button" onClick={() => setLyricsOpen(true)} className="mt-2 block w-full text-left">
          <ul className="space-y-2">
            <AnimatePresence initial={false} mode="popLayout">
              {preview.map((line, n) => (
                <motion.li
                  key={`${line.at}-${line.text}`}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                  className={`text-[17px] leading-snug tracking-tight ${
                    (synced ? lines.indexOf(line) === current : n === 0)
                      ? 'font-bold text-[#111]'
                      : 'font-medium text-neutral-400/80'
                  }`}
                >
                  {line.text}
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        </button>
      )}
    </section>
  )
}

/* ── Queue (drag to reorder) ───────────────────────────────────────── */

function UpNext() {
  const p = usePlayer()
  const { createPlaylist } = useLibrary()
  const toast = useToast()
  const [all, setAll] = useState(false)
  const upcoming = p.queue.slice(p.index + 1)
  if (!p.current) return null
  const limit = all ? upcoming.length : 8
  // Reorder needs stable keys; position-suffixed ids stay unique with duplicates.
  const items = upcoming.slice(0, limit).map((t, n) => ({ key: `${t.id}#${n}`, t }))

  const reorder = (next) => {
    const moved = next.map((x) => x.t)
    p.setUpcoming([...moved, ...upcoming.slice(limit)])
  }

  const saveQueue = () => {
    const id = createPlaylist(`Queue · ${new Date().toLocaleDateString()}`, p.queue)
    toast('Saved the queue as a playlist', { action: { label: 'Open', run: () => (window.location.hash = `/playlist/${id}`) } })
  }

  return (
    <section className="border-t border-black/10 px-6 pt-5 pb-[max(env(safe-area-inset-bottom),32px)]">
      <div className="mb-2 flex items-center justify-between">
        <Eyebrow className="flex items-center gap-2 text-[#111]">
          <ListMusic size={13} strokeWidth={1.5} /> Up next · {upcoming.length}
        </Eyebrow>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={saveQueue}
            className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-neutral-400 hover:text-[#111]"
          >
            <Save size={11} /> Save
          </button>
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
      </div>
      {upcoming.length === 0 ? (
        <p className="py-2 text-[13px] text-neutral-400">
          The queue is empty.{' '}
          <button type="button" onClick={() => p.startRadio(p.current)} className="font-semibold text-[#111] underline">
            Start a radio
          </button>{' '}
          to keep the music going.
        </p>
      ) : (
        <Reorder.Group axis="y" values={items} onReorder={reorder} className="space-y-0.5">
          {items.map((item, n) => {
            const i = p.index + 1 + n
            const t = item.t
            return (
              <Reorder.Item
                key={item.key}
                value={item}
                className="group flex items-center gap-2 rounded-xl bg-[#F2F2F2] py-1.5 hover:bg-black/[0.04]"
                whileDrag={{ scale: 1.02, boxShadow: '0 12px 30px -12px rgba(0,0,0,0.35)' }}
              >
                <GripVertical size={14} strokeWidth={1.5} className="shrink-0 cursor-grab text-neutral-300 active:cursor-grabbing" />
                <button type="button" onClick={() => p.jump(i)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                  <Artwork track={t} className="h-10 w-10 shrink-0" />
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-semibold tracking-tight">{t.title}</span>
                    <span className="block truncate text-[11px] text-neutral-400">{t.artist}</span>
                  </span>
                </button>
                <IconButton icon={X} label="Remove from queue" onClick={() => p.removeAt(i)} size={14} className="h-8 w-8" />
                <TrackMenu track={t} />
              </Reorder.Item>
            )
          })}
        </Reorder.Group>
      )}
      {upcoming.length > 8 && (
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
