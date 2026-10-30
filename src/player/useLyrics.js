import { useEffect, useMemo, useState } from 'react'
import { fetchCandidates, pickLyrics } from '../lib/lyrics'
import { useLibrary } from '../store/library'
import { usePlayer } from './PlayerProvider'

/**
 * Lyrics for a track: { loading, lines, synced, approx }.
 * Picks the version whose length matches what's actually playing (only for
 * the current track — other tracks fall back to their listed duration).
 * Empty-text lines are instrumental breaks.
 */
export function useLyrics(track) {
  const { current, duration: playing } = usePlayer()
  const [state, setState] = useState({ id: null, loading: false, candidates: [] })

  useEffect(() => {
    if (!track || track.pending) return setState({ id: null, loading: false, candidates: [] })
    let alive = true
    setState({ id: track.id, loading: true, candidates: [] })
    fetchCandidates(track).then((candidates) => alive && setState({ id: track.id, loading: false, candidates }))
    return () => {
      alive = false
    }
  }, [track?.id, track?.title, track?.pending]) // eslint-disable-line react-hooks/exhaustive-deps

  // Re-pick only when the known length changes meaningfully.
  const length = Math.round((current?.id === track?.id ? playing : 0) || track?.duration || 0)
  const picked = useMemo(() => pickLyrics(state.candidates, length), [state.candidates, length])

  return {
    loading: state.loading,
    lines: picked?.lines ?? [],
    synced: !!picked?.synced,
    approx: !!picked?.approx,
  }
}

/** Index of the line being sung at `time` (-1 before the first line). */
export function activeLineIndex(lines, time) {
  let i = -1
  for (let n = 0; n < lines.length; n++) {
    if (time + 0.15 >= lines[n].at) i = n
    else break
  }
  return i
}

/** Per-track lyric timing (seconds), stored with the library so it syncs. */
export function useTrackOffset(track) {
  const { settings, updateSettings } = useLibrary()
  const map = settings.lyricOffsets || {}
  const own = (track && map[track.id]) || 0
  const set = (v) => track && updateSettings({ lyricOffsets: { ...map, [track.id]: Math.round(v * 10) / 10 } })
  return { own, total: own + (settings.lyricsOffset || 0), set }
}

