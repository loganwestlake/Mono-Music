import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ChevronDown, Minus, Plus, SkipBack, SkipForward, Timer, Type } from 'lucide-react'
import Artwork from '../components/Artwork'
import Scrubber from '../components/Scrubber'
import { IconButton } from '../components/ui'
import { artUrl } from '../lib/tracks'
import { useLibrary } from '../store/library'
import { PlayButton } from './NowPlaying'
import { usePlayer, usePlayerTime } from './PlayerProvider'
import { activeLineIndex, useLyrics } from './useLyrics'

/**
 * Full-screen, Apple Music–style lyrics.
 *  · huge bold lines; the sung line fills in left→right (karaoke) and glows
 *  · the rest are dim and softly blurred by distance; lines glide up in a
 *    staggered spring cascade
 *  · a slowly drifting, layered blur of the artwork behind everything
 *  · scroll/drag to read ahead (blur lifts), snaps back after a moment
 *  · click a line to jump there; text size + timing adjustable in place
 *  · controls fade away while you just watch
 */
export default function LyricsView({ open, onClose }) {
  const p = usePlayer()
  const track = p.current
  const [chrome, setChrome] = useState(true)
  const idle = useRef()

  const wake = useCallback(() => {
    setChrome(true)
    clearTimeout(idle.current)
    idle.current = setTimeout(() => setChrome(false), 3500)
  }, [])

  useEffect(() => {
    if (!open) return
    wake()
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
      wake()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      clearTimeout(idle.current)
    }
  }, [open, onClose, wake])

  const showChrome = chrome || !p.playing

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          role="dialog"
          aria-label="Lyrics"
          data-noinvert
          onPointerMove={wake}
          onPointerDown={wake}
          className="fixed inset-0 z-[55] flex flex-col overflow-hidden bg-[#070707] text-white"
          initial={{ opacity: 0, scale: 1.02 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 1.02 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        >
          <Backdrop track={track} />
          <TopProgress />

          <div className="relative mx-auto grid h-full w-full max-w-[1500px] min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] lg:grid-cols-[minmax(300px,460px)_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)] lg:gap-20 lg:px-16">
            {/* Phone header / desktop side panel */}
            <aside className="flex items-center gap-3 px-5 pt-[max(env(safe-area-inset-top),18px)] lg:flex-col lg:items-start lg:justify-center lg:gap-0 lg:px-0 lg:pt-0">
              {track && (
                <>
                  <Artwork track={track} className="h-12 w-12 shrink-0 rounded-lg shadow-2xl lg:hidden" />
                  <motion.div
                    key={track.id}
                    className="hidden w-full lg:block"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0, scale: p.playing ? 1 : 0.94 }}
                    transition={{ type: 'spring', stiffness: 120, damping: 18 }}
                  >
                    <Artwork
                      track={track}
                      shape="blob-a"
                      className="aspect-square w-full shadow-[0_40px_80px_-30px_rgba(0,0,0,0.9)]"
                    />
                  </motion.div>
                </>
              )}
              <div className="min-w-0 flex-1 lg:mt-10 lg:w-full lg:flex-none">
                <p className="truncate text-[15px] font-bold tracking-tight lg:text-[34px] lg:leading-[1.02] lg:font-black lg:tracking-[-0.03em] lg:whitespace-normal">
                  {track?.title ?? 'Nothing playing'}
                </p>
                <p className="truncate text-[10px] font-bold uppercase tracking-widest text-white/50 lg:mt-2 lg:font-serif lg:text-[20px] lg:font-normal lg:tracking-normal lg:normal-case lg:italic">
                  {track?.artist}
                </p>
              </div>
              <IconButton icon={ChevronDown} label="Close lyrics (Esc)" tone="light" onClick={onClose} className="lg:hidden" />
              <motion.div className="hidden w-full lg:block" animate={{ opacity: showChrome ? 1 : 0.15 }} transition={{ duration: 0.6 }}>
                <Transport />
              </motion.div>
            </aside>

            <section className="relative min-h-0">
              <motion.div
                className="absolute top-5 right-0 z-10 hidden items-center gap-1 lg:flex"
                animate={{ opacity: showChrome ? 1 : 0 }}
                transition={{ duration: 0.6 }}
              >
                <Tweaks />
                <IconButton icon={ChevronDown} label="Close lyrics (Esc)" tone="light" onClick={onClose} />
              </motion.div>
              <LyricsBody track={track} />
            </section>

            <motion.footer
              className="px-5 pb-[max(env(safe-area-inset-bottom),20px)] lg:hidden"
              animate={{ opacity: showChrome ? 1 : 0.2 }}
              transition={{ duration: 0.6 }}
            >
              <div className="flex justify-center">
                <Tweaks />
              </div>
              <Transport />
            </motion.footer>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function TopProgress() {
  const { time, duration } = usePlayerTime()
  return (
    <div className="absolute inset-x-0 top-0 z-10 h-[2px] bg-white/10">
      <div className="h-full bg-white/80 transition-[width] duration-300 ease-linear" style={{ width: `${duration ? (time / duration) * 100 : 0}%` }} />
    </div>
  )
}

function Transport() {
  const p = usePlayer()
  return (
    <div className="mono-dark mt-6 w-full">
      <Scrubber onSeek={p.seek} disabled={!p.current} />
      <div className="mt-2 flex items-center justify-center gap-6">
        <IconButton icon={SkipBack} label="Previous" tone="light" onClick={p.prev} size={22} />
        <PlayButton tone="light" />
        <IconButton icon={SkipForward} label="Next" tone="light" onClick={p.next} size={22} />
      </div>
    </div>
  )
}

/** Text size and timing, adjustable without leaving the view. */
function Tweaks() {
  const { settings, updateSettings } = useLibrary()
  const pill = 'flex items-center gap-1 rounded-full bg-white/10 p-0.5 backdrop-blur'
  const btn = 'grid h-7 w-7 place-items-center rounded-full text-white/80 hover:bg-white/15 hover:text-white'
  return (
    <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest">
      <div className={pill} title="Text size">
        <button type="button" className={btn} aria-label="Smaller text" onClick={() => updateSettings({ lyricsSize: Math.max(0.7, +(settings.lyricsSize - 0.1).toFixed(1)) })}>
          <Minus size={12} />
        </button>
        <Type size={12} className="text-white/60" />
        <button type="button" className={btn} aria-label="Larger text" onClick={() => updateSettings({ lyricsSize: Math.min(1.4, +(settings.lyricsSize + 0.1).toFixed(1)) })}>
          <Plus size={12} />
        </button>
      </div>
      <div className={pill} title="Lyrics timing">
        <button type="button" className={btn} aria-label="Lyrics earlier" onClick={() => updateSettings({ lyricsOffset: +(settings.lyricsOffset - 0.5).toFixed(1) })}>
          <Minus size={12} />
        </button>
        <span className="flex items-center gap-1 px-1 text-white/60 tabular-nums">
          <Timer size={12} />
          {settings.lyricsOffset > 0 ? '+' : ''}
          {settings.lyricsOffset.toFixed(1)}
        </span>
        <button type="button" className={btn} aria-label="Lyrics later" onClick={() => updateSettings({ lyricsOffset: +(settings.lyricsOffset + 0.5).toFixed(1) })}>
          <Plus size={12} />
        </button>
      </div>
    </div>
  )
}

/** Layered, drifting blur of the artwork — Apple's living background, in mono. */
function Backdrop({ track }) {
  const reduceMotion = useReducedMotion()
  if (!track) return null
  const src = artUrl(track)
  const layers = [
    { cls: 'top-[-25%] left-[-20%] h-[95%] w-[95%] opacity-70', rotate: 360, scale: [1.5, 1.85, 1.5], dur: 70 },
    { cls: 'right-[-25%] bottom-[-25%] h-[95%] w-[95%] opacity-55 contrast-150', rotate: -360, scale: [1.7, 1.4, 1.7], dur: 90 },
    { cls: 'top-[20%] left-[30%] h-[60%] w-[60%] opacity-40 brightness-150', rotate: 360, scale: [1.2, 1.6, 1.2], dur: 55 },
  ]
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <AnimatePresence>
        {src && (
          <motion.div key={track.id} className="absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 1.5 }}>
            {layers.map((l, i) => (
              <motion.img
                key={i}
                src={src}
                alt=""
                className={`absolute rounded-full object-cover blur-[100px] grayscale ${l.cls}`}
                animate={reduceMotion ? undefined : { rotate: [0, l.rotate], scale: l.scale }}
                transition={{ duration: l.dur, repeat: Infinity, ease: 'linear' }}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(0,0,0,0.15)_0%,rgba(0,0,0,0.65)_100%)]" />
    </div>
  )
}

function LyricsBody({ track }) {
  const { loading, lines, synced } = useLyrics(track)
  const { settings } = useLibrary()

  let message = null
  if (!track) message = 'Play a song to see its lyrics.'
  else if (track.pending || loading) message = 'Finding lyrics…'
  else if (!lines.length) message = 'No lyrics for this one. Just listen.'
  if (message)
    return (
      <div className="grid h-full place-items-center px-6 text-center">
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md font-serif text-[clamp(30px,4vw,56px)] leading-[1.05] text-white/50 italic"
        >
          {message}
        </motion.p>
      </div>
    )

  return synced ? (
    <SyncedLyrics lines={lines} size={settings.lyricsSize} offset={settings.lyricsOffset} />
  ) : (
    <PlainLyrics lines={lines} size={settings.lyricsSize} />
  )
}

function PlainLyrics({ lines, size }) {
  return (
    <div className="no-scrollbar h-full overflow-y-auto px-5 py-12 [mask-image:linear-gradient(to_bottom,transparent,black_8%,black_88%,transparent)] lg:px-0 lg:py-28">
      <p className="mb-6 text-[10px] font-bold uppercase tracking-widest text-white/40">Lyrics (not time-synced)</p>
      {lines.map((l, i) => (
        <p
          key={i}
          style={{ fontSize: `calc(clamp(22px, 2.6vw, 38px) * ${size})` }}
          className="py-2 leading-[1.15] font-extrabold tracking-[-0.02em] text-white/85"
        >
          {l.text}
        </p>
      ))}
      <Credit />
    </div>
  )
}

const ANCHOR = 0.32 // active line sits about a third of the way down

function SyncedLyrics({ lines: raw, size, offset }) {
  const { time: rawTime } = usePlayerTime()
  const time = rawTime + offset
  const { seek } = usePlayer()
  const reduceMotion = useReducedMotion()

  // Add a leading "instrumental" marker when the vocals start late.
  const lines = useMemo(() => (raw[0]?.at > 4 ? [{ at: 0, text: '' }, ...raw] : raw), [raw])
  const active = activeLineIndex(lines, time)

  const viewportRef = useRef(null)
  const lineRefs = useRef([])
  const [layout, setLayout] = useState({ tops: [], height: 0 })
  const [offsetY, setOffsetY] = useState(0)
  const [browsing, setBrowsing] = useState(false)
  const idleTimer = useRef()

  // Measure each line's resting position (offsetTop ignores transforms).
  useLayoutEffect(() => {
    const measure = () =>
      setLayout({
        tops: lineRefs.current.map((el) => el?.offsetTop ?? 0),
        height: viewportRef.current?.clientHeight ?? 0,
      })
    measure()
    const ro = new ResizeObserver(measure)
    if (viewportRef.current) ro.observe(viewportRef.current)
    return () => ro.disconnect()
  }, [lines, size])

  const browse = useCallback((delta) => {
    setBrowsing(true)
    setOffsetY((o) => o + delta)
    clearTimeout(idleTimer.current)
    idleTimer.current = setTimeout(() => {
      setBrowsing(false)
      setOffsetY(0)
    }, 2800)
  }, [])

  useEffect(() => () => clearTimeout(idleTimer.current), [])

  const touchY = useRef(null)
  const focus = Math.max(0, active)
  const y = layout.height * ANCHOR - (layout.tops[focus] ?? 0) - offsetY

  const jump = (line) => {
    clearTimeout(idleTimer.current)
    setBrowsing(false)
    setOffsetY(0)
    seek(Math.max(0, line.at - offset))
  }

  return (
    <div
      ref={viewportRef}
      onWheel={(e) => browse(e.deltaY)}
      onTouchStart={(e) => (touchY.current = e.touches[0].clientY)}
      onTouchMove={(e) => {
        if (touchY.current == null) return
        const ny = e.touches[0].clientY
        browse(touchY.current - ny)
        touchY.current = ny
      }}
      onTouchEnd={() => (touchY.current = null)}
      className="relative h-full touch-none overflow-hidden px-5 [mask-image:linear-gradient(to_bottom,transparent,black_14%,black_78%,transparent)] lg:px-0"
    >
      <ul className="relative pr-4">
        {lines.map((line, i) => {
          const dist = Math.abs(i - active)
          const isActive = i === active
          const blur = browsing || reduceMotion ? 0 : Math.min(dist, 5) * 0.8
          const delay = browsing ? 0 : Math.max(0, Math.min(i - active, 10)) * 0.04
          const end = lines[i + 1]?.at ?? line.at + 5
          const fill = isActive ? Math.min(100, Math.max(0, ((time - line.at) / Math.max(0.5, end - line.at - 0.2)) * 100)) : 0
          return (
            <motion.li
              key={`${line.at}-${i}`}
              ref={(el) => (lineRefs.current[i] = el)}
              onClick={() => jump(line)}
              initial={false}
              animate={{
                y,
                opacity: isActive ? 1 : browsing ? 0.6 : i < active ? 0.2 : Math.max(0.16, 0.42 - dist * 0.05),
                scale: isActive ? 1 : 0.965,
                filter: `blur(${blur}px)`,
              }}
              transition={{
                y: { type: 'spring', stiffness: 85, damping: 19, mass: 0.9, delay },
                scale: { type: 'spring', stiffness: 120, damping: 18 },
                default: { duration: 0.6, ease: 'easeOut' },
              }}
              style={{ fontSize: `calc(clamp(30px, 4vw, 58px) * ${size})` }}
              className="origin-left cursor-pointer py-[0.32em] leading-[1.1] font-extrabold tracking-[-0.025em] hover:!opacity-90"
            >
              {line.text ? (
                isActive ? (
                  <span
                    className="lyric-fill"
                    style={{ '--fill': `${fill}%` }}
                  >
                    {line.text}
                  </span>
                ) : (
                  line.text
                )
              ) : (
                <InstrumentalDots active={isActive} start={line.at} end={end} time={time} />
              )}
            </motion.li>
          )
        })}
        <li aria-hidden className="h-[70vh]" />
      </ul>
      <div className="absolute right-0 bottom-3 left-5 lg:left-0">
        <Credit />
      </div>
    </div>
  )
}

/** Apple's "• • •" for instrumental breaks: dots fill in as the break plays. */
function InstrumentalDots({ active, start, end, time }) {
  const progress = active ? Math.min(1, Math.max(0, (time - start) / Math.max(1, end - start))) : 0
  return (
    <motion.span
      className="ml-[0.2em] inline-flex h-[1.1em] items-center gap-[0.3em]"
      animate={active ? { scale: progress > 0.92 ? 0.6 : [1, 1.2, 1] } : { scale: 1 }}
      transition={active && progress <= 0.92 ? { duration: 2.4, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.4 }}
    >
      {[0, 1, 2].map((k) => (
        <span
          key={k}
          className="block h-[0.3em] w-[0.3em] rounded-full bg-white transition-opacity duration-300"
          style={{ opacity: active ? 0.25 + 0.75 * Math.min(1, Math.max(0, progress * 3 - k)) : 0.3 }}
        />
      ))}
    </motion.span>
  )
}

function Credit() {
  return <p className="text-[9px] font-bold uppercase tracking-widest text-white/30">Lyrics via LRCLIB</p>
}
