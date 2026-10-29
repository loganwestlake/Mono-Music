import { useEffect, useState } from 'react'
import { fetchLyrics } from '../lib/lyrics'

/** Lyrics for a track: { loading, lines, synced }. Empty-text lines are instrumental breaks. */
export function useLyrics(track) {
  const [state, setState] = useState({ loading: false, lines: [], synced: false })

  useEffect(() => {
    if (!track || track.pending) return setState({ loading: false, lines: [], synced: false })
    let alive = true
    setState({ loading: true, lines: [], synced: false })
    fetchLyrics(track).then((data) => {
      if (alive) setState({ loading: false, lines: data?.lines ?? [], synced: !!data?.synced })
    })
    return () => {
      alive = false
    }
  }, [track?.id, track?.title, track?.pending]) // eslint-disable-line react-hooks/exhaustive-deps

  return state
}

/** Index of the line being sung at `time` (-1 before the first line). */
export function activeLineIndex(lines, time) {
  let i = -1
  for (let n = 0; n < lines.length; n++) if (time + 0.25 >= lines[n].at) i = n
  return i
}
