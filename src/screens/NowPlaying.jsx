import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowLeft,
  Heart,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
} from 'lucide-react'
import ScallopedPlayer from '../components/ScallopedPlayer'
import { Eyebrow, IconButton, ScreenHeader } from '../components/ui'
import { formatTime, useYouTubePlayer } from '../lib/useYouTubePlayer'
import { LYRICS, TRACKS } from '../lib/data'

const REPEAT_MODES = ['off', 'all', 'one']

export default function NowPlaying({ onBack }) {
  const [index, setIndex] = useState(0)
  const [liked, setLiked] = useState(() => new Set())
  const [shuffle, setShuffle] = useState(false)
  const [repeat, setRepeat] = useState('off')
  const track = TRACKS[index]

  const nextIndex = () => {
    if (shuffle && TRACKS.length > 1) {
      let i = index
      while (i === index) i = Math.floor(Math.random() * TRACKS.length)
      return i
    }
    return (index + 1) % TRACKS.length
  }

  const player = useYouTubePlayer(track.videoId, {
    onEnded: () => {
      if (repeat === 'one') {
        player.seek(0)
        player.play()
      } else if (repeat === 'all' || shuffle || index < TRACKS.length - 1) {
        setIndex(nextIndex())
      }
    },
  })

  const handlePrev = () => {
    // Like every good player: restart first, go back on a second tap.
    if (player.currentTime > 3) return player.seek(0)
    setIndex((i) => (i - 1 + TRACKS.length) % TRACKS.length)
  }

  const isLiked = liked.has(track.id)
  const toggleLike = () =>
    setLiked((prev) => {
      const next = new Set(prev)
      next.has(track.id) ? next.delete(track.id) : next.add(track.id)
      return next
    })

  return (
    <div className="flex min-h-dvh flex-col sm:min-h-[860px]">
      <ScreenHeader
        left={<IconButton icon={ArrowLeft} label="Back" onClick={onBack} />}
        title="Current Track"
        right={
          <IconButton
            icon={Heart}
            fill={isLiked ? 'currentColor' : 'none'}
            label={isLiked ? 'Remove from favourites' : 'Add to favourites'}
            onClick={toggleLike}
          />
        }
      />

      <main className="flex flex-1 flex-col items-center px-6">
        <Eyebrow className="mt-8 tabular-nums">
          {formatTime(player.currentTime)} / {formatTime(player.duration)}
        </Eyebrow>

        <div className="mt-6">
          <ScallopedPlayer mountRef={player.mountRef} playing={player.playing} />
        </div>

        <TrackInfo track={track} />

        <Controls
          playing={player.playing}
          ready={player.ready}
          shuffle={shuffle}
          repeat={repeat}
          onToggle={player.toggle}
          onPrev={handlePrev}
          onNext={() => setIndex(nextIndex())}
          onShuffle={() => setShuffle((s) => !s)}
          onRepeat={() => setRepeat((r) => REPEAT_MODES[(REPEAT_MODES.indexOf(r) + 1) % REPEAT_MODES.length])}
        />
      </main>

      <LyricsPreview lines={LYRICS[track.id]} currentTime={player.currentTime} />
    </div>
  )
}

function TrackInfo({ track }) {
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={track.id}
        className="mt-10 text-center"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      >
        <h2 className="text-[40px] leading-[0.95] font-black tracking-tight text-[#111] uppercase">
          {track.title}
        </h2>
        <Eyebrow className="mt-3">{track.artist}</Eyebrow>
      </motion.div>
    </AnimatePresence>
  )
}

function Controls({ playing, ready, shuffle, repeat, onToggle, onPrev, onNext, onShuffle, onRepeat }) {
  return (
    <div className="mt-10 flex w-full max-w-[340px] items-center justify-between">
      <IconButton icon={Shuffle} label="Shuffle" active={shuffle} onClick={onShuffle} size={18} />
      <IconButton icon={SkipBack} label="Previous" onClick={onPrev} size={22} />

      <motion.button
        type="button"
        aria-label={playing ? 'Pause' : 'Play'}
        onClick={onToggle}
        disabled={!ready}
        whileTap={{ scale: 0.92 }}
        className="grid h-[76px] w-[76px] place-items-center rounded-full bg-[#111] text-white shadow-[0_12px_30px_-10px_rgba(0,0,0,0.6)] disabled:opacity-60"
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={playing ? 'pause' : 'play'}
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.6 }}
            transition={{ duration: 0.15 }}
            className="grid place-items-center"
          >
            {playing ? (
              <Pause size={26} strokeWidth={1.25} fill="currentColor" />
            ) : (
              <Play size={26} strokeWidth={1.25} fill="currentColor" className="translate-x-[2px]" />
            )}
          </motion.span>
        </AnimatePresence>
      </motion.button>

      <IconButton icon={SkipForward} label="Next" onClick={onNext} size={22} />
      <IconButton
        icon={repeat === 'one' ? Repeat1 : Repeat}
        label={`Repeat: ${repeat}`}
        active={repeat !== 'off'}
        onClick={onRepeat}
        size={18}
      />
    </div>
  )
}

function LyricsPreview({ lines = [], currentTime }) {
  const [expanded, setExpanded] = useState(false)

  const current = useMemo(() => {
    let i = 0
    lines.forEach((line, n) => {
      if (currentTime >= line.at) i = n
    })
    return i
  }, [lines, currentTime])

  const visible = expanded ? lines : lines.slice(current, current + 3)

  return (
    <motion.section
      layout
      className="mt-10 border-t border-black/10 px-6 pt-5 pb-[max(env(safe-area-inset-bottom),28px)]"
    >
      <div className="flex items-center justify-between">
        <Eyebrow className="text-[#111]">Lyrics</Eyebrow>
        <IconButton
          icon={expanded ? Minimize2 : Maximize2}
          label={expanded ? 'Collapse lyrics' : 'Expand lyrics'}
          onClick={() => setExpanded((e) => !e)}
          size={16}
          className="-mr-3 h-9 w-9"
        />
      </div>

      {lines.length === 0 ? (
        <p className="mt-2 text-[15px] text-neutral-400">Lyrics unavailable for this track.</p>
      ) : (
        <motion.ul layout className="mt-2 space-y-2">
          <AnimatePresence initial={false} mode="popLayout">
            {visible.map((line) => {
              const isCurrent = line === lines[current]
              return (
                <motion.li
                  key={line.at}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                  className={`text-[17px] leading-snug tracking-tight transition-colors duration-500 ${
                    isCurrent ? 'font-bold text-[#111]' : 'font-medium text-neutral-400/70'
                  }`}
                >
                  {line.text}
                </motion.li>
              )
            })}
          </AnimatePresence>
        </motion.ul>
      )}
    </motion.section>
  )
}
