import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Heart, MicVocal, SkipBack, SkipForward, X } from 'lucide-react'
import Artwork from '../components/Artwork'
import Scrubber from '../components/Scrubber'
import { IconButton } from '../components/ui'
import { useLibrary } from '../store/library'
import { useToast } from '../store/toast'
import { useUi } from '../store/ui'
import { PlayButton } from './NowPlaying'
import { usePlayer, usePlayerTime } from './PlayerProvider'
import { activeLineIndex, useLyrics, useTrackOffset } from './useLyrics'

/**
 * Pop-out mini player: a small always-on-top window (Document
 * Picture-in-Picture, Chrome/Edge 116+) that stays visible over other tabs
 * and apps. The React tree renders straight into it through a portal, so
 * it shares the live player state. Browsers without it fall back to native
 * video PiP (ad-free video) or a hint.
 */

const Ctx = createContext({ open: () => {}, close: () => {}, isOpen: false })

export function MiniWindowProvider({ children }) {
  const [win, setWin] = useState(null)
  const player = usePlayer()
  const toast = useToast()

  const close = useCallback(() => win?.close(), [win])

  const open = useCallback(async () => {
    if (win) return win.focus()
    try {
      if ('documentPictureInPicture' in window) {
        const pip = await window.documentPictureInPicture.requestWindow({ width: 340, height: 460 })
        copyStyles(pip.document)
        pip.document.title = 'Mono Music'
        pip.addEventListener('pagehide', () => setWin(null), { once: true })
        setWin(pip)
        return
      }
      if (await player.videoPictureInPicture()) return
      toast('The pop-out player needs Chrome or Edge. Your browser’s media controls work from any tab too.')
    } catch {
      toast('Couldn’t open the mini player.')
    }
  }, [win, player, toast])

  // Close it with the main window.
  useEffect(() => {
    if (!win) return
    const onUnload = () => win.close()
    window.addEventListener('pagehide', onUnload)
    return () => window.removeEventListener('pagehide', onUnload)
  }, [win])

  const value = useMemo(() => ({ open, close, isOpen: !!win }), [open, close, win])

  return (
    <Ctx.Provider value={value}>
      {children}
      {win && createPortal(<MiniPlayerWindow onClose={close} />, win.document.body)}
    </Ctx.Provider>
  )
}

export const useMiniWindow = () => useContext(Ctx)

/** Carry the app's stylesheets (Tailwind + fonts) into the new window. */
function copyStyles(target) {
  for (const sheet of document.styleSheets) {
    try {
      const style = target.createElement('style')
      style.textContent = [...sheet.cssRules].map((r) => r.cssText).join('\n')
      target.head.appendChild(style)
    } catch {
      if (sheet.href) {
        const link = target.createElement('link')
        link.rel = 'stylesheet'
        link.href = sheet.href
        target.head.appendChild(link)
      }
    }
  }
}

function MiniPlayerWindow({ onClose }) {
  const p = usePlayer()
  const { isLiked, toggleLike } = useLibrary()
  const { setLyricsOpen } = useUi()
  const track = p.current
  const liked = track && isLiked(track.id)

  return (
    <div className="flex h-dvh flex-col bg-[#F2F2F2] p-5 text-[#111] select-none">
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-black tracking-tight uppercase">
          Mono<span className="text-neutral-400">.</span>
        </span>
        <IconButton icon={X} label="Close mini player" onClick={onClose} size={16} className="-mr-2 h-8 w-8" />
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center py-3">
        {track ? (
          <Artwork
            track={track}
            shape="blob-a"
            className="aspect-square h-full max-h-[190px] shadow-[0_18px_36px_-20px_rgba(0,0,0,0.6)]"
          />
        ) : (
          <p className="text-[13px] text-neutral-400">Nothing playing</p>
        )}
      </div>

      <div className="text-center">
        <p className="truncate text-[18px] leading-tight font-black tracking-tight uppercase">{track?.title ?? '—'}</p>
        <p className="mt-1 truncate text-[10px] font-bold uppercase tracking-widest text-neutral-400">{track?.artist}</p>
      </div>

      <CurrentLine track={track} />

      <Scrubber onSeek={p.seek} disabled={!track} className="mt-2" />

      <div className="mt-1 flex items-center justify-between">
        <IconButton
          icon={Heart}
          label="Like"
          fill={liked ? 'currentColor' : 'none'}
          dot={false}
          onClick={() => track && toggleLike(track)}
          size={17}
          disabled={!track}
        />
        <IconButton icon={SkipBack} label="Previous" onClick={p.prev} size={20} />
        <PlayButton size="sm" />
        <IconButton icon={SkipForward} label="Next" onClick={p.next} size={20} />
        <IconButton
          icon={MicVocal}
          label="Show lyrics in main window"
          onClick={() => {
            setLyricsOpen(true)
            window.focus()
          }}
          size={17}
          disabled={!track}
        />
      </div>
    </div>
  )
}

/** The lyric line being sung right now, if synced lyrics exist. */
function CurrentLine({ track }) {
  const { lines, synced } = useLyrics(track)
  const { time } = usePlayerTime()
  const offset = useTrackOffset(track)
  const text = synced ? lines[activeLineIndex(lines, time + offset.total)]?.text : null
  return (
    <p className="mt-2 h-5 truncate text-center text-[12px] font-semibold tracking-tight text-[#111]/70">{text || ' '}</p>
  )
}
