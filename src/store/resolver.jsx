import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { load, save } from '../lib/storage'
import { matchTrack } from '../lib/search'
import { isUnresolved } from '../lib/tracks'
import { useLibrary } from './library'

/**
 * Matches songs that only have a title + artist (Spotify/CSV imports,
 * recommendations, radio) to YouTube videos.
 *   resolve(track)    → the YouTube id, right now (used before playback)
 *   resolveAll(list)  → background matching with a progress banner
 * Matches are remembered so each song is only looked up once.
 */

const Ctx = createContext(null)
const memory = load('matches', { map: {} }).map

export function ResolverProvider({ children }) {
  const library = useLibrary()
  const [job, setJob] = useState(null) // { label, done, total, failed }
  const inflight = useRef(new Map())
  const libRef = useRef(library)
  libRef.current = library

  const resolve = useCallback(async (track) => {
    if (!isUnresolved(track)) return track.id
    if (memory[track.id]) return memory[track.id].id
    if (inflight.current.has(track.id)) return inflight.current.get(track.id)

    const p = matchTrack(track, { apiKey: libRef.current.settings.apiKey })
      .then((hit) => {
        if (!hit) return null
        memory[track.id] = { id: hit.id, duration: hit.duration }
        save('matches', { map: memory })
        libRef.current.resolveTrack(track.id, hit.id, hit.duration)
        return hit.id
      })
      .catch(() => null)
      .finally(() => inflight.current.delete(track.id))
    inflight.current.set(track.id, p)
    return p
  }, [])

  const resolveAll = useCallback(
    async (tracks, label = 'Matching songs') => {
      const todo = tracks.filter((t) => isUnresolved(t) && !memory[t.id])
      // Already-known matches apply instantly.
      tracks.filter((t) => isUnresolved(t) && memory[t.id]).forEach((t) => libRef.current.resolveTrack(t.id, memory[t.id].id, memory[t.id].duration))
      if (!todo.length) return
      let done = 0
      let failed = 0
      setJob({ label, done, total: todo.length, failed })
      const queue = [...todo]
      const worker = async () => {
        while (queue.length) {
          const t = queue.shift()
          const id = await resolve(t)
          done++
          if (!id) failed++
          setJob({ label, done, total: todo.length, failed })
        }
      }
      await Promise.all([worker(), worker(), worker()])
      setTimeout(() => setJob(null), 2500)
    },
    [resolve],
  )

  const value = useMemo(() => ({ resolve, resolveAll, job }), [resolve, resolveAll, job])

  return (
    <Ctx.Provider value={value}>
      {children}
      <AnimatePresence>
        {job && (
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="fixed top-[max(env(safe-area-inset-top),12px)] left-1/2 z-[75] w-[min(420px,calc(100vw-24px))] -translate-x-1/2 rounded-2xl bg-[#111] px-5 py-3 text-white shadow-2xl"
          >
            <div className="flex items-center justify-between text-[11px] font-semibold tracking-tight">
              <span>{job.done < job.total ? `${job.label}…` : 'All set'}</span>
              <span className="tabular-nums text-white/60">
                {job.done}/{job.total}
                {job.failed ? ` · ${job.failed} not found` : ''}
              </span>
            </div>
            <div className="mt-2 h-[2px] overflow-hidden rounded bg-white/15">
              <motion.div className="h-full bg-white" animate={{ width: `${(job.done / job.total) * 100}%` }} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Ctx.Provider>
  )
}

export const useResolver = () => useContext(Ctx)
