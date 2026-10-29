import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { BarChart3, CornerDownLeft, Download, Heart, Home, Library, ListMusic, Moon, Music, Search, Settings, User } from 'lucide-react'
import { navigate } from '../lib/router'
import { usePlayer } from '../player/PlayerProvider'
import { useLibrary } from '../store/library'
import { useUi } from '../store/ui'
import Artwork from './Artwork'

/**
 * ⌘K / Ctrl+K: jump anywhere — pages, playlists, songs in your library,
 * artists, actions — or search YouTube for whatever you typed.
 */
export default function CommandPalette({ open, onClose }) {
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const library = useLibrary()
  const player = usePlayer()
  const ui = useUi()
  const listRef = useRef(null)

  useEffect(() => {
    if (open) {
      setQ('')
      setActive(0)
    }
  }, [open])

  const items = useMemo(() => {
    const term = q.trim().toLowerCase()
    const match = (s) => !term || s.toLowerCase().includes(term)
    const go = (to) => () => navigate(to)
    const pages = [
      { icon: Home, label: 'Home', run: go('/') },
      { icon: Search, label: 'Search', run: go('/search') },
      { icon: Library, label: 'Library', run: go('/library') },
      { icon: Heart, label: 'Liked Songs', run: go('/liked') },
      { icon: BarChart3, label: 'Your Stats', run: go('/stats') },
      { icon: Settings, label: 'Settings', run: go('/settings') },
      { icon: Download, label: 'Import playlists', run: () => ui.setImportOpen(true) },
      {
        icon: Moon,
        label: library.settings.theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode',
        run: () => library.updateSettings({ theme: library.settings.theme === 'dark' ? 'light' : 'dark' }),
      },
    ].filter((p) => match(p.label))

    const playlists = library.playlists
      .filter((p) => match(p.name))
      .slice(0, 6)
      .map((p) => ({ icon: ListMusic, label: p.name, hint: `${p.tracks.length} songs`, run: go(`/playlist/${p.id}`) }))

    const pool = new Map()
    ;[...library.liked, ...library.recent, ...library.playlists.flatMap((p) => p.tracks)].forEach((t) => pool.set(t.id, t))
    const songs = term
      ? [...pool.values()]
          .filter((t) => match(`${t.title} ${t.artist}`))
          .slice(0, 6)
          .map((t) => ({ track: t, label: t.title, hint: t.artist, run: () => player.playTrack(t) }))
      : []

    const artists = term
      ? [...new Set([...pool.values()].map((t) => t.artist))]
          .filter(match)
          .slice(0, 3)
          .map((a) => ({ icon: User, label: a, hint: 'Artist', run: go(`/artist/${encodeURIComponent(a)}`) }))
      : []

    const searchAll = term
      ? [{ icon: Music, label: `Search for “${q.trim()}”`, hint: 'YouTube', run: go(`/search?q=${encodeURIComponent(q.trim())}`) }]
      : []

    return [...searchAll, ...songs, ...artists, ...playlists, ...pages]
  }, [q, library, player, ui])

  const runAt = (i) => {
    const item = items[i]
    if (!item) return
    onClose()
    item.run()
  }

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => Math.min(items.length - 1, a + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(0, a - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      runAt(active)
    } else if (e.key === 'Escape') onClose()
  }

  useEffect(() => {
    listRef.current?.children[active]?.scrollIntoView({ block: 'nearest' })
  }, [active])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[85] flex items-start justify-center bg-black/30 px-4 pt-[12vh] backdrop-blur-[3px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            role="dialog"
            aria-label="Command palette"
            className="w-full max-w-xl overflow-hidden rounded-3xl bg-[#F2F2F2] shadow-2xl"
            initial={{ y: -12, scale: 0.98 }}
            animate={{ y: 0, scale: 1 }}
            exit={{ y: -12, scale: 0.98 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 border-b border-black/10 px-5">
              <Search size={18} strokeWidth={1.5} />
              <input
                autoFocus
                value={q}
                onChange={(e) => {
                  setQ(e.target.value)
                  setActive(0)
                }}
                onKeyDown={onKeyDown}
                placeholder="Search songs, artists, playlists, actions…"
                className="h-16 min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-neutral-400"
              />
              <kbd className="rounded-md border border-black/15 px-1.5 py-0.5 font-sans text-[10px] font-semibold text-neutral-400">esc</kbd>
            </div>
            <ul ref={listRef} className="no-scrollbar max-h-[50vh] overflow-y-auto p-2">
              {items.map((item, i) => {
                const Icon = item.icon
                return (
                  <li key={`${item.label}-${i}`}>
                    <button
                      type="button"
                      onMouseEnter={() => setActive(i)}
                      onClick={() => runAt(i)}
                      className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left ${i === active ? 'bg-[#111] text-white' : ''}`}
                    >
                      {item.track ? (
                        <Artwork track={item.track} className="h-8 w-8 shrink-0 rounded-md" />
                      ) : (
                        <span className="grid h-8 w-8 shrink-0 place-items-center">
                          <Icon size={16} strokeWidth={1.5} />
                        </span>
                      )}
                      <span className="min-w-0 flex-1 truncate text-[14px] font-semibold tracking-tight">{item.label}</span>
                      {item.hint && <span className={`truncate text-[11px] ${i === active ? 'text-white/50' : 'text-neutral-400'}`}>{item.hint}</span>}
                      {i === active && <CornerDownLeft size={14} className="shrink-0 text-white/60" />}
                    </button>
                  </li>
                )
              })}
              {items.length === 0 && <li className="px-4 py-8 text-center text-[13px] text-neutral-400">Nothing matches.</li>}
            </ul>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
