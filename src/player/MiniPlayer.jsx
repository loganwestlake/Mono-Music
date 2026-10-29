import { MicVocal, PictureInPicture2, SkipBack, SkipForward } from 'lucide-react'
import Artwork from '../components/Artwork'
import { IconButton } from '../components/ui'
import { usePlayer, usePlayerTime } from './PlayerProvider'
import { PlayButton, VolumeControl } from './NowPlaying'
import { useMiniWindow } from './MiniWindow'
import { useUi } from '../store/ui'

/** Compact bar above the tab bar; tap to open the full player. */
export default function MiniPlayer({ onOpen }) {
  const p = usePlayer()
  const { setLyricsOpen } = useUi()
  const mini = useMiniWindow()
  if (!p.current) return null
  const track = p.current

  return (
    <div className="relative border-t border-black/10 bg-[#F2F2F2]/95 backdrop-blur lg:col-start-2">
      <Progress />
      <div className="flex items-center gap-3 px-3 py-2 lg:px-6 lg:py-3">
        <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-label="Open player">
          <Artwork track={track} shape="circle" className={`h-11 w-11 shrink-0 ${p.playing ? 'animate-[spin_12s_linear_infinite]' : ''}`} />
          <span className="min-w-0">
            <span className="block truncate text-[14px] font-bold tracking-tight">{track.title}</span>
            <span className="block truncate text-[10px] font-bold uppercase tracking-widest text-neutral-400">
              {p.error ?? track.artist}
            </span>
          </span>
        </button>
        <IconButton icon={SkipBack} label="Previous" onClick={p.prev} size={18} className="hidden sm:grid" />
        <PlayButton size="sm" />
        <IconButton icon={SkipForward} label="Next" onClick={p.next} size={18} />
        <IconButton icon={MicVocal} label="Lyrics" onClick={() => setLyricsOpen(true)} size={18} className="hidden sm:grid" />
        <IconButton
          icon={PictureInPicture2}
          label={mini.isOpen ? 'Close mini player' : 'Pop-out mini player'}
          active={mini.isOpen}
          onClick={mini.isOpen ? mini.close : mini.open}
          size={18}
          className="hidden lg:grid"
        />
        <VolumeControl className="ml-2 hidden w-36 items-center gap-1 lg:flex" />
      </div>
    </div>
  )
}

function Progress() {
  const { time, duration } = usePlayerTime()
  const pct = duration ? (time / duration) * 100 : 0
  return (
    <div className="absolute inset-x-0 top-0 h-[2px] bg-black/5">
      <div className="h-full bg-[#111] transition-[width] duration-300 ease-linear" style={{ width: `${pct}%` }} />
    </div>
  )
}
