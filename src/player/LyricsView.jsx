import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ChevronDown, Crosshair, Minus, Plus, SkipBack, SkipForward, Timer, Type } from 'lucide-react'
import Artwork from '../components/Artwork'
import Scrubber from '../components/Scrubber'
import { IconButton } from '../components/ui'
import { artUrl } from '../lib/tracks'
import { useLibrary } from '../store/library'
import { useToast } from '../store/toast'
import { PlayButton } from './NowPlaying'
import { usePlayer, usePlayerTime } from './PlayerProvider'
import { activeLineIndex, effectiveOffset, useLyrics, useTrackOffset } from './useLyrics'

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
  const [syncMode, setSyncMode] = useState(false)
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

  const showChrome = chrome || !p.playing || syncMode

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
                <Tweaks track={track} syncMode={syncMode} setSyncMode={setSyncMode} />
                <IconButton icon={ChevronDown} label="Close lyrics (Esc)" tone="light" onClick={onClose} />
              </motion.div>
              <LyricsBody track={track} syncMode={syncMode} setSyncMode={setSyncMode} />
            </section>

            <motion.footer
              className="px-5 pb-[max(env(safe-area-inset-bottom),20px)] lg:hidden"
              animate={{ opacity: showChrome ? 1 : 0.2 }}
              transition={{ duration: 0.6 }}
            >
              <div className="flex justify-center">
                <Tweaks track={track} syncMode={syncMode} setSyncMode={setSyncMode} />
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

/** Text size, timing for this song, and tap-to-sync — without leaving the view. */
function Tweaks({ track, syncMode, setSyncMode }) {
  const { settings, updateSettings } = useLibrary()
  const offset = useTrackOffset(track)
  const pill = 'flex items-center gap-1 rounded-full bg-white/10 p-0.5 backdrop-blur'
  const btn = 'grid h-7 w-7 place-items-center rounded-full text-white/80 hover:bg-white/15 hover:text-white'
  return (
    <div className="flex flex-wrap items-center justify-center gap-2 text-[10px] font-bold uppercase tracking-widest">
      <div className={pill} title="Text size">
        <button type="button" className={btn} aria-label="Smaller text" onClick={() => updateSettings({ lyricsSize: Math.max(0.7, +(settings.lyricsSize - 0.1).toFixed(1)) })}>
          <Minus size={12} />
        </button>
        <Type size={12} className="text-white/60" />
        <button type="button" className={btn} aria-label="Larger text" onClick={() => updateSettings({ lyricsSize: Math.min(1.4, +(settings.lyricsSize + 0.1).toFixed(1)) })}>
          <Plus size={12} />
        </button>
      </div>
      <div className={pill} title="Timing for this song">
        <button type="button" className={btn} aria-label="Lyrics earlier" onClick={() => offset.set(offset.own + 0.3)}>
          <Minus size={12} />
        </button>
        <span className="flex items-center gap-1 px-1 text-white/60 tabular-nums">
          <Timer size={12} />
          {offset.own > 0 ? '+' : ''}
          {offset.own.toFixed(1)}s
        </span>
        <button type="button" className={btn} aria-label="Lyrics later" onClick={() => offset.set(offset.own - 0.3)}>
          <Plus size={12} />
        </button>
      </div>
      <button
        type="button"
        onClick={() => setSyncMode(!syncMode)}
        className={`flex h-8 items-center gap-1.5 rounded-full px-3 backdrop-blur transition ${
          syncMode ? 'bg-white text-[#111]' : 'bg-white/10 text-white/80 hover:bg-white/15'
        }`}
      >
        <Crosshair size={12} /> {syncMode ? 'Tap the line being sung' : 'Sync'}
      </button>
      {offset.own !== 0 && !syncMode && (
        <button type="button" onClick={() => offset.set(0)} className="h-8 rounded-full px-2 text-white/50 hover:text-white">
          Reset
        </button>
      )}
    </div>
  )
}

/**
 * Layered, drifting blur of the artwork — Apple's living background, in mono.
 * Performance: each layer is blurred once at a small size and then only
 * *transformed* (CSS keyframes), so the GPU just moves a cached texture —
 * no per-frame blurring of a full-screen image.
 */
function Backdrop({ track }) {
  if (!track) return null
  const src = artUrl(track)
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <AnimatePresence>
        {src && (
          <motion.div key={track.id} className="absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 1.2 }}>
            {['drift-a opacity-70 top-[5%] left-[5%]', 'drift-b opacity-50 right-[5%] bottom-[5%]', 'drift-c opacity-40 top-[35%] left-[35%]'].map((cls, i) => (
              <div key={i} className={`backdrop-layer absolute h-[34vmax] w-[34vmax] ${cls}`}>
                <img src={src} alt="" className="h-full w-full rounded-full object-cover blur-[22px] grayscale" />
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(0,0,0,0.15)_0%,rgba(0,0,0,0.65)_100%)]" />
    </div>
  )
}

function LyricsBody({ track, syncMode, setSyncMode }) {
  const { loading, lines, synced, approx, autoOffset } = useLyrics(track)
  const { settings } = useLibrary()
  const offset = useTrackOffset(track)
  const { getTime } = usePlayer()
  const toast = useToast()

  // Tap-to-sync: the tapped line is the one being sung right now.
  const syncTo = (line) => {
    offset.set(line.at - getTime() - (settings.lyricsOffset || 0))
    setSyncMode(false)
    toast('Lyrics synced for this song')
  }

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
    <>
      {(syncMode || (approx && !autoOffset)) && offset.own === 0 && (
        <p className="absolute top-3 left-5 z-10 rounded-full bg-white/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-white/70 backdrop-blur lg:left-0">
          {syncMode ? 'Tap the line that’s being sung now' : 'Timing may be off for this version — tap Sync'}
        </p>
      )}
      <SyncedLyrics lines={lines} size={settings.lyricsSize} offset={effectiveOffset(offset, autoOffset)} onPick={syncMode ? syncTo : null} />
    </>
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
const FINE_POINTER = typeof window !== 'undefined' && window.matchMedia?.('(pointer: fine)').matches
const EASE = 'cubic-bezier(0.2, 0.9, 0.25, 1)'

/**
 * Smoothness notes:
 *  · The clock is read in a requestAnimationFrame loop, not from React
 *    state — React only re-renders when the *active line* changes.
 *  · The karaoke fill and instrumental dots are written straight to the DOM
 *    every frame (60fps, no re-render).
 *  · Line movement is a CSS transform transition (GPU), staggered with
 *    transition-delay for the cascade. Soft blur only on desktop.
 */
function SyncedLyrics({ lines: raw, size, offset, onPick }) {
  const { seek, getTime } = usePlayer()
  const reduceMotion = useReducedMotion()

  // Add a leading "instrumental" marker when the vocals start late.
  const lines = useMemo(() => (raw[0]?.at > 4 ? [{ at: 0, text: '' }, ...raw] : raw), [raw])
  const [active, setActive] = useState(() => activeLineIndex(lines, getTime() + offset))

  const viewportRef = useRef(null)
  const lineRefs = useRef([])
  const [layout, setLayout] = useState({ tops: [], height: 0 })
  const [offsetY, setOffsetY] = useState(0)
  const [browsing, setBrowsing] = useState(false)
  const idleTimer = useRef()

  // Per-frame clock: pick the active line, paint the fill and the dots.
  useEffect(() => {
    let raf
    let last = -2
    const tick = () => {
      const t = getTime() + offset
      const i = activeLineIndex(lines, t)
      if (i !== last) {
        last = i
        setActive(i)
      }
      const el = lineRefs.current[i]
      if (el && i >= 0) {
        const start = lines[i].at
        const end = lines[i + 1]?.at ?? start + 5
        const p = Math.min(1, Math.max(0, (t - start) / Math.max(0.5, end - start - 0.2)))
        if (lines[i].text) el.style.setProperty('--fill', `${(p * 100).toFixed(1)}%`)
        else {
          const dots = el.querySelectorAll('[data-dot]')
          dots.forEach((d, k) => (d.style.opacity = String(0.25 + 0.75 * Math.min(1, Math.max(0, p * 3 - k)))))
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [lines, offset, getTime])

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
  const y = Math.round(layout.height * ANCHOR - (layout.tops[focus] ?? 0) - offsetY)

  const jump = (line) => {
    clearTimeout(idleTimer.current)
    setBrowsing(false)
    setOffsetY(0)
    if (onPick) onPick(line)
    else seek(Math.max(0, line.at - offset))
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
          const opacity = isActive ? 1 : browsing ? 0.6 : i < active ? 0.22 : Math.max(0.16, 0.42 - dist * 0.05)
          const blur = FINE_POINTER && !browsing && !reduceMotion && dist >= 2 ? Math.min(dist - 1, 3) * 0.9 : 0
          const delay = browsing || reduceMotion ? 0 : Math.max(0, Math.min(i - active + 1, 10)) * 45
          const moveMs = browsing ? 120 : reduceMotion ? 0 : 750
          return (
            <li
              key={`${line.at}-${i}`}
              ref={(el) => (lineRefs.current[i] = el)}
              onClick={() => jump(line)}
              style={{
                fontSize: `calc(clamp(30px, 4vw, 58px) * ${size})`,
                transform: `translate3d(0, ${y}px, 0) scale(${isActive ? 1 : 0.965})`,
                opacity,
                filter: blur ? `blur(${blur}px)` : 'none',
                transition: `transform ${moveMs}ms ${EASE} ${delay}ms, opacity 450ms ease, filter 450ms ease`,
              }}
              className="origin-left cursor-pointer py-[0.32em] leading-[1.1] font-extrabold tracking-[-0.025em] will-change-transform hover:!opacity-90"
            >
              {line.text ? (
                <span className={isActive ? 'lyric-fill' : undefined}>{line.text}</span>
              ) : (
                <InstrumentalDots active={isActive} />
              )}
            </li>
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

/** Apple's "• • •" for instrumental breaks; the frame loop fills the dots in. */
function InstrumentalDots({ active }) {
  return (
    <span className={`ml-[0.2em] inline-flex h-[1.1em] items-center gap-[0.3em] ${active ? 'animate-[breathe_2.4s_ease-in-out_infinite]' : ''}`}>
      {[0, 1, 2].map((k) => (
        <span key={k} data-dot className="block h-[0.3em] w-[0.3em] rounded-full bg-white" style={{ opacity: 0.3 }} />
      ))}
    </span>
  )
}

function Credit() {
  return <p className="text-[9px] font-bold uppercase tracking-widest text-white/30">Lyrics via LRCLIB</p>
}
