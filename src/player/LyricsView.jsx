import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ChevronDown, SkipBack, SkipForward } from 'lucide-react'
import Artwork from '../components/Artwork'
import Scrubber from '../components/Scrubber'
import { IconButton } from '../components/ui'
import { thumbUrl } from '../lib/tracks'
import { PlayButton } from './NowPlaying'
import { usePlayer, usePlayerTime } from './PlayerProvider'
import { activeLineIndex, useLyrics } from './useLyrics'

/**
 * Full-screen, Apple Music–style lyrics: huge bold lines on a slowly
 * drifting, blurred artwork backdrop. The sung line is bright, the rest
 * dim and softly blurred; lines glide up in a staggered spring cascade.
 * Scroll/drag to read ahead (blur lifts), it snaps back after a moment.
 * Click any line to jump there.
 */
export default function LyricsView({ open, onClose }) {
  const p = usePlayer()
  const track = p.current

  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          role="dialog"
          aria-label="Lyrics"
          className="fixed inset-0 z-[55] flex flex-col overflow-hidden bg-[#0a0a0a] text-white"
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 40 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        >
          <Backdrop track={track} />

          <div className="relative mx-auto grid h-full w-full max-w-[1400px] min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] lg:grid-cols-[minmax(280px,420px)_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)] lg:gap-16 lg:px-16">
            {/* Header (phone) / side panel (desktop) */}
            <aside className="flex items-center gap-3 px-5 pt-[max(env(safe-area-inset-top),16px)] lg:flex-col lg:items-start lg:justify-center lg:gap-0 lg:px-0 lg:pt-0">
              {track && (
                <Artwork
                  track={track}
                  className="h-12 w-12 shrink-0 rounded-lg shadow-2xl lg:aspect-square lg:h-auto lg:w-full lg:rounded-2xl"
                />
              )}
              <div className="min-w-0 flex-1 lg:mt-8 lg:w-full lg:flex-none">
                <p className="truncate text-[15px] font-bold tracking-tight lg:text-[28px] lg:leading-tight lg:font-black">
                  {track?.title ?? 'Nothing playing'}
                </p>
                <p className="truncate text-[10px] font-bold uppercase tracking-widest text-white/50 lg:mt-1 lg:text-[11px]">
                  {track?.artist}
                </p>
              </div>
              <IconButton icon={ChevronDown} label="Close lyrics (Esc)" tone="light" onClick={onClose} className="lg:hidden" />
              <div className="hidden w-full lg:block">
                <Transport />
              </div>
            </aside>

            <section className="relative min-h-0">
              <div className="absolute top-6 right-0 z-10 hidden lg:block">
                <IconButton icon={ChevronDown} label="Close lyrics (Esc)" tone="light" onClick={onClose} />
              </div>
              <LyricsBody track={track} />
            </section>

            <footer className="px-5 pb-[max(env(safe-area-inset-bottom),20px)] lg:hidden">
              <Transport />
            </footer>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function Transport() {
  const p = usePlayer()
  return (
    <div className="mono-dark mt-6">
      <Scrubber onSeek={p.seek} disabled={!p.current} />
      <div className="mt-2 flex items-center justify-center gap-6">
        <IconButton icon={SkipBack} label="Previous" tone="light" onClick={p.prev} size={22} />
        <PlayButton tone="light" />
        <IconButton icon={SkipForward} label="Next" tone="light" onClick={p.next} size={22} />
      </div>
    </div>
  )
}

/** Two oversized, blurred copies of the artwork drifting in opposite directions. */
function Backdrop({ track }) {
  const reduceMotion = useReducedMotion()
  if (!track) return null
  const src = thumbUrl(track.id)
  const spin = (dir) =>
    reduceMotion ? undefined : { rotate: [0, 360 * dir], scale: [1.6, 1.9, 1.6] }
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <motion.img
        key={`a-${track.id}`}
        src={src}
        alt=""
        className="absolute top-[-20%] left-[-20%] h-[90%] w-[90%] object-cover opacity-60 blur-[90px] grayscale"
        animate={spin(1)}
        transition={{ duration: 60, repeat: Infinity, ease: 'linear' }}
      />
      <motion.img
        key={`b-${track.id}`}
        src={src}
        alt=""
        className="absolute right-[-20%] bottom-[-20%] h-[90%] w-[90%] object-cover opacity-50 blur-[90px] grayscale contrast-150"
        animate={spin(-1)}
        transition={{ duration: 80, repeat: Infinity, ease: 'linear' }}
      />
      <div className="absolute inset-0 bg-black/45" />
    </div>
  )
}

function LyricsBody({ track }) {
  const { loading, lines, synced } = useLyrics(track)

  let message = null
  if (!track) message = 'Play a song to see its lyrics.'
  else if (track.pending || loading) message = 'Finding lyrics…'
  else if (!lines.length) message = 'No lyrics found for this song.'
  if (message)
    return (
      <div className="grid h-full place-items-center px-6 text-center">
        <p className="text-[clamp(24px,3vw,40px)] font-extrabold tracking-tight text-white/40">{message}</p>
      </div>
    )

  return synced ? <SyncedLyrics lines={lines} /> : <PlainLyrics lines={lines} />
}

function PlainLyrics({ lines }) {
  return (
    <div className="no-scrollbar h-full overflow-y-auto px-5 py-10 lg:px-0 lg:py-24">
      {lines.map((l, i) => (
        <p
          key={i}
          className="py-2 text-[clamp(22px,2.6vw,36px)] leading-[1.15] font-extrabold tracking-tight text-white/85"
        >
          {l.text}
        </p>
      ))}
      <Credit />
    </div>
  )
}

const ANCHOR = 0.3 // active line sits 30% down the viewport

function SyncedLyrics({ lines: raw }) {
  const { time } = usePlayerTime()
  const { seek } = usePlayer()
  const reduceMotion = useReducedMotion()

  // Add a leading "instrumental" marker when the vocals start late.
  const lines = useMemo(() => (raw[0]?.at > 4 ? [{ at: 0, text: '' }, ...raw] : raw), [raw])
  const active = activeLineIndex(lines, time)

  const viewportRef = useRef(null)
  const lineRefs = useRef([])
  const [layout, setLayout] = useState({ tops: [], height: 0 })
  const [offset, setOffset] = useState(0) // manual scroll offset
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
  }, [lines])

  const browse = useCallback((delta) => {
    setBrowsing(true)
    setOffset((o) => o + delta)
    clearTimeout(idleTimer.current)
    idleTimer.current = setTimeout(() => {
      setBrowsing(false)
      setOffset(0)
    }, 2800)
  }, [])

  useEffect(() => () => clearTimeout(idleTimer.current), [])

  // Touch drag
  const touchY = useRef(null)
  const onTouchStart = (e) => (touchY.current = e.touches[0].clientY)
  const onTouchMove = (e) => {
    if (touchY.current == null) return
    const y = e.touches[0].clientY
    browse(touchY.current - y)
    touchY.current = y
  }

  const focus = Math.max(0, active)
  const y = layout.height * ANCHOR - (layout.tops[focus] ?? 0) - offset

  const jump = (line) => {
    clearTimeout(idleTimer.current)
    setBrowsing(false)
    setOffset(0)
    seek(line.at)
  }

  return (
    <div
      ref={viewportRef}
      onWheel={(e) => browse(e.deltaY)}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={() => (touchY.current = null)}
      className="relative h-full touch-none overflow-hidden px-5 [mask-image:linear-gradient(to_bottom,transparent,black_12%,black_80%,transparent)] lg:px-0"
    >
      <ul className="relative">
        {lines.map((line, i) => {
          const dist = Math.abs(i - active)
          const isActive = i === active
          const blur = browsing || reduceMotion ? 0 : Math.min(dist, 4) * 0.9
          // Lines below the active one follow with a slight delay → cascade.
          const delay = browsing ? 0 : Math.max(0, Math.min(i - active, 8)) * 0.045
          return (
            <motion.li
              key={`${line.at}-${i}`}
              ref={(el) => (lineRefs.current[i] = el)}
              onClick={() => jump(line)}
              initial={false}
              animate={{
                y,
                opacity: isActive ? 1 : browsing ? 0.55 : i < active ? 0.22 : 0.3,
                scale: isActive ? 1 : 0.97,
                filter: `blur(${blur}px)`,
              }}
              transition={{
                y: { type: 'spring', stiffness: 90, damping: 20, mass: 0.9, delay },
                default: { duration: 0.5, ease: 'easeOut' },
              }}
              className="origin-left cursor-pointer py-[0.35em] text-[clamp(28px,3.8vw,52px)] leading-[1.12] font-extrabold tracking-tight hover:opacity-80"
            >
              {line.text ? (
                line.text
              ) : (
                <InstrumentalDots
                  active={isActive}
                  start={line.at}
                  end={lines[i + 1]?.at ?? line.at + 6}
                />
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
function InstrumentalDots({ active, start, end }) {
  const { time } = usePlayerTime()
  const progress = active ? Math.min(1, Math.max(0, (time - start) / Math.max(1, end - start))) : 0
  return (
    <motion.span
      className="ml-[0.2em] inline-flex h-[1.12em] items-center gap-[0.28em]"
      animate={active ? { scale: [1, 1.18, 1] } : { scale: 1 }}
      transition={{ duration: 2.2, repeat: active ? Infinity : 0, ease: 'easeInOut' }}
    >
      {[0, 1, 2].map((k) => (
        <span
          key={k}
          className="block h-[0.32em] w-[0.32em] rounded-full bg-white transition-opacity duration-300"
          style={{ opacity: active ? 0.25 + 0.75 * Math.min(1, Math.max(0, progress * 3 - k)) : 0.35 }}
        />
      ))}
    </motion.span>
  )
}

function Credit() {
  return <p className="text-[9px] font-bold uppercase tracking-widest text-white/30">Lyrics via LRCLIB</p>
}
