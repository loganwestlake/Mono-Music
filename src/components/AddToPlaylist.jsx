import { createContext, useCallback, useContext, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, Plus, X } from 'lucide-react'
import { useLibrary } from '../store/library'
import { useToast } from '../store/toast'
import { IconButton, PillButton } from './ui'

const Ctx = createContext(() => {})

/** Provides `openAddToPlaylist(track)` and renders the picker sheet. */
export function AddToPlaylistProvider({ children }) {
  const [track, setTrack] = useState(null)
  const open = useCallback((t) => setTrack(t), [])
  return (
    <Ctx.Provider value={open}>
      {children}
      <AnimatePresence>{track && <PlaylistPicker track={track} onClose={() => setTrack(null)} />}</AnimatePresence>
    </Ctx.Provider>
  )
}

export const useAddToPlaylist = () => useContext(Ctx)

function PlaylistPicker({ track, onClose }) {
  const { playlists, addToPlaylist, createPlaylist } = useLibrary()
  const toast = useToast()
  const [name, setName] = useState('')

  const add = (playlist) => {
    addToPlaylist(playlist.id, track)
    toast(`Added to ${playlist.name}`)
    onClose()
  }

  const create = (e) => {
    e.preventDefault()
    if (!name.trim()) return
    createPlaylist(name, [track])
    toast(`Created ${name.trim()}`)
    onClose()
  }

  return (
    <motion.div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/30 backdrop-blur-[2px] sm:items-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label="Add to playlist"
        className="w-full max-w-md rounded-t-[28px] bg-[#F2F2F2] p-6 pb-[max(env(safe-area-inset-bottom),24px)] sm:rounded-[28px]"
        initial={{ y: 40 }}
        animate={{ y: 0 }}
        exit={{ y: 40 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Add to playlist</p>
            <p className="mt-1 truncate text-[18px] font-black tracking-tight">{track.title}</p>
          </div>
          <IconButton icon={X} label="Close" onClick={onClose} className="-mt-2 -mr-3" />
        </div>

        <form onSubmit={create} className="mt-5 flex gap-2">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="New playlist name"
            className="h-12 min-w-0 flex-1 rounded-full border border-black/10 bg-white px-5 text-[14px] outline-none placeholder:text-neutral-400 focus:border-black/40"
          />
          <PillButton type="submit" icon={Plus} disabled={!name.trim()} onClick={undefined}>
            Create
          </PillButton>
        </form>

        <ul className="no-scrollbar mt-4 max-h-[40vh] overflow-y-auto">
          {playlists.map((p) => {
            const has = p.tracks.some((t) => t.id === track.id)
            return (
              <li key={p.id}>
                <button
                  type="button"
                  disabled={has}
                  onClick={() => add(p)}
                  className="flex w-full items-center justify-between rounded-xl px-3 py-3 text-left hover:bg-black/5 disabled:opacity-50"
                >
                  <span className="truncate text-[14px] font-semibold tracking-tight">{p.name}</span>
                  {has ? (
                    <Check size={16} strokeWidth={1.5} />
                  ) : (
                    <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">
                      {p.tracks.length} songs
                    </span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      </motion.div>
    </motion.div>
  )
}
