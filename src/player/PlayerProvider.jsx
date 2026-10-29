import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { describePlayerError, loadYouTubeApi, PLAYER_VARS } from '../lib/youtube'
import { load, save } from '../lib/storage'
import { parseVideoTitle, shuffled, thumbUrl } from '../lib/tracks'
import { useLibrary } from '../store/library'
import { useToast } from '../store/toast'

/**
 * The single, app-wide YouTube player plus queue.
 *
 * YouTube is only a silent engine: the iframe is mounted once into the
 * scalloped mask (see ScallopedPlayer → `mountRef`) and never moved, so
 * playback continues while the listener browses. Everything else talks to
 * the controls exposed here.
 *
 * State is split into two contexts so the 4×/sec clock doesn't re-render
 * the whole app: usePlayer() for queue/controls, usePlayerTime() for time.
 */

const PlayerContext = createContext(null)
const TimeContext = createContext({ time: 0, duration: 0 })

const YT_STATE = { ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 }

const SAVED_DEFAULTS = { queue: [], index: 0, time: 0, volume: 80, shuffle: false, repeat: 'off', original: null }

export function PlayerProvider({ children }) {
  const library = useLibrary()
  const toast = useToast()
  const [saved] = useState(() => load('player', SAVED_DEFAULTS))

  const [queue, setQueue] = useState(saved.queue)
  const [index, setIndex] = useState(Math.min(saved.index, Math.max(0, saved.queue.length - 1)))
  const [original, setOriginal] = useState(saved.original) // pre-shuffle order
  const [shuffle, setShuffle] = useState(saved.shuffle)
  const [repeat, setRepeat] = useState(saved.repeat)
  const [volume, setVolumeState] = useState(saved.volume)
  const [muted, setMuted] = useState(false)

  const [status, setStatus] = useState('idle') // idle | loading | ready | blocked
  const [playing, setPlaying] = useState(false)
  const [buffering, setBuffering] = useState(false)
  const [error, setError] = useState(null)
  const [time, setTime] = useState(saved.time || 0)
  const [duration, setDuration] = useState(0)
  const [mountEl, setMountEl] = useState(null)

  const playerRef = useRef(null)
  const wantPlayRef = useRef(false) // start playing as soon as the current track loads
  const loadedIdRef = useRef(null)
  const resumeAtRef = useRef(saved.time || 0)
  const loggedIdRef = useRef(null)
  const errorStreakRef = useRef(0)

  const current = queue[index] ?? null

  /* ── Create the player once a mount point exists ─────────────────── */
  const handlers = useRef({})

  useEffect(() => {
    if (!mountEl) return
    let cancelled = false
    setStatus('loading')
    loadYouTubeApi()
      .then((YT) => {
        if (cancelled) return
        // YouTube replaces its target with an <iframe>; give it a node React doesn't own.
        const target = document.createElement('div')
        mountEl.replaceChildren(target)
        playerRef.current = new YT.Player(target, {
          width: '100%',
          height: '100%',
          host: 'https://www.youtube-nocookie.com',
          playerVars: { ...PLAYER_VARS, origin: window.location.origin },
          events: {
            onReady: (e) => {
              e.target.setVolume(volumeRef.current)
              setStatus('ready')
            },
            onStateChange: (e) => handlers.current.onState(e.data),
            onError: (e) => handlers.current.onError(e.data),
          },
        })
      })
      .catch(() => !cancelled && setStatus('blocked'))
    return () => {
      cancelled = true
      playerRef.current?.destroy?.()
      playerRef.current = null
      loadedIdRef.current = null
      setStatus('idle')
    }
  }, [mountEl])

  const volumeRef = useRef(volume)
  volumeRef.current = volume

  /* ── Load whichever track is current ──────────────────────────────── */
  useEffect(() => {
    const p = playerRef.current
    if (status !== 'ready' || !p || !current) return
    if (loadedIdRef.current === current.id) return
    loadedIdRef.current = current.id
    setError(null)
    setBuffering(wantPlayRef.current)
    setDuration(current.duration || 0)
    const startSeconds = resumeAtRef.current
    resumeAtRef.current = 0
    setTime(startSeconds)
    if (wantPlayRef.current) p.loadVideoById({ videoId: current.id, startSeconds })
    else p.cueVideoById({ videoId: current.id, startSeconds })
  }, [status, current])

  /* ── Player event handlers (refreshed each render for fresh state) ── */
  handlers.current.onState = (state) => {
    const p = playerRef.current
    if (!p) return
    switch (state) {
      case YT_STATE.PLAYING: {
        setPlaying(true)
        setBuffering(false)
        wantPlayRef.current = true
        errorStreakRef.current = 0
        setDuration(p.getDuration?.() || current?.duration || 0)
        const track = current?.pending ? fillMetadata(p) : current
        if (track && loggedIdRef.current !== track.id) {
          loggedIdRef.current = track.id
          library.addRecent(track)
        }
        break
      }
      case YT_STATE.PAUSED:
        setPlaying(false)
        setBuffering(false)
        wantPlayRef.current = false
        break
      case YT_STATE.BUFFERING:
        setBuffering(true)
        break
      case YT_STATE.ENDED:
        setPlaying(false)
        handleEnded()
        break
      case YT_STATE.CUED:
        setPlaying(false)
        setBuffering(false)
        break
      default:
    }
  }

  handlers.current.onError = (code) => {
    setPlaying(false)
    setBuffering(false)
    const message = describePlayerError(code)
    setError(message)
    errorStreakRef.current += 1
    const canSkip = queue.length > 1 && errorStreakRef.current < queue.length
    toast(canSkip ? `${message} Skipping…` : message)
    if (canSkip) {
      wantPlayRef.current = true
      setTimeout(() => setIndex((i) => (i + 1) % queue.length), 1200)
    }
  }

  /** Pasted links start as placeholders; fill in the real title/artist from YouTube. */
  function fillMetadata(p) {
    const data = p.getVideoData?.()
    if (!data?.title) return current
    const filled = { ...current, ...parseVideoTitle(data.title, data.author), duration: p.getDuration?.() || 0, pending: false }
    setQueue((q) => q.map((t) => (t.id === filled.id ? filled : t)))
    return filled
  }

  function handleEnded() {
    const p = playerRef.current
    if (repeat === 'one' || (repeat === 'all' && queue.length === 1)) {
      p?.seekTo(0, true)
      p?.playVideo()
    } else if (index < queue.length - 1) {
      wantPlayRef.current = true
      setIndex(index + 1)
    } else if (repeat === 'all') {
      wantPlayRef.current = true
      setIndex(0)
    } else {
      wantPlayRef.current = false
    }
  }

  /* ── Clock ────────────────────────────────────────────────────────── */
  useEffect(() => {
    if (!playing) return
    const id = setInterval(() => setTime(playerRef.current?.getCurrentTime?.() || 0), 250)
    return () => clearInterval(id)
  }, [playing])

  /* ── Persistence ─────────────────────────────────────────────────── */
  const timeRef = useRef(time)
  timeRef.current = time
  useEffect(() => {
    const persist = () =>
      save('player', { queue: queue.slice(0, 500), index, time: timeRef.current, volume, shuffle, repeat, original })
    persist()
    const id = setInterval(persist, 5000)
    window.addEventListener('pagehide', persist)
    return () => {
      clearInterval(id)
      window.removeEventListener('pagehide', persist)
    }
  }, [queue, index, volume, shuffle, repeat, original])

  /* ── Controls ─────────────────────────────────────────────────────── */
  const restartCurrent = useCallback(() => {
    const p = playerRef.current
    if (!p) return
    p.seekTo(0, true)
    p.playVideo()
  }, [])

  const playTracks = useCallback(
    (tracks, start = 0) => {
      if (!tracks.length) return
      const first = tracks[start]
      let list = tracks
      let at = start
      if (shuffle) {
        setOriginal(tracks)
        list = [first, ...shuffled(tracks.filter((_, i) => i !== start))]
        at = 0
      } else {
        setOriginal(null)
      }
      wantPlayRef.current = true
      errorStreakRef.current = 0
      setQueue(list)
      setIndex(at)
      if (loadedIdRef.current === first.id) restartCurrent()
    },
    [shuffle, restartCurrent],
  )

  const playTrack = useCallback(
    (track) => {
      wantPlayRef.current = true
      errorStreakRef.current = 0
      if (current?.id === track.id) return restartCurrent()
      setQueue((q) => (q.length ? [...q.slice(0, index + 1), track, ...q.slice(index + 1)] : [track]))
      setIndex((i) => (queue.length ? i + 1 : 0))
    },
    [current, index, queue.length, restartCurrent],
  )

  const playNext = useCallback(
    (track) => {
      setQueue((q) => (q.length ? [...q.slice(0, index + 1), track, ...q.slice(index + 1)] : [track]))
      toast(`“${track.title}” plays next`)
    },
    [index, toast],
  )

  const enqueue = useCallback(
    (track) => {
      setQueue((q) => [...q, track])
      toast(`Added “${track.title}” to the queue`)
    },
    [toast],
  )

  const toggle = useCallback(() => {
    const p = playerRef.current
    if (!p || !current) return
    if (playing) p.pauseVideo()
    else {
      wantPlayRef.current = true
      p.playVideo()
    }
  }, [playing, current])

  const next = useCallback(() => {
    if (!queue.length) return
    wantPlayRef.current = true
    if (index < queue.length - 1) setIndex(index + 1)
    else if (repeat === 'all' || queue.length > 1) setIndex(0)
    else restartCurrent()
  }, [queue.length, index, repeat, restartCurrent])

  const prev = useCallback(() => {
    if (!queue.length) return
    wantPlayRef.current = true
    if (timeRef.current > 3 || index === 0) restartCurrent()
    else setIndex(index - 1)
  }, [queue.length, index, restartCurrent])

  const seek = useCallback((seconds) => {
    playerRef.current?.seekTo(seconds, true)
    setTime(seconds)
  }, [])

  const getTime = useCallback(() => playerRef.current?.getCurrentTime?.() ?? timeRef.current, [])

  const setVolume = useCallback((v) => {
    const p = playerRef.current
    setVolumeState(v)
    setMuted(v === 0)
    p?.setVolume(v)
    if (v > 0) p?.unMute()
  }, [])

  const toggleMute = useCallback(() => {
    const p = playerRef.current
    if (!p) return
    if (muted) {
      p.unMute()
      if (volume === 0) setVolume(50)
    } else p.mute()
    setMuted(!muted)
  }, [muted, volume, setVolume])

  const jump = useCallback((i) => {
    wantPlayRef.current = true
    setIndex(i)
  }, [])

  const removeAt = useCallback(
    (i) => {
      if (i === index) return
      setQueue((q) => q.filter((_, n) => n !== i))
      if (i < index) setIndex(index - 1)
    },
    [index],
  )

  const clearUpcoming = useCallback(() => setQueue((q) => q.slice(0, index + 1)), [index])

  const toggleShuffle = useCallback(() => {
    if (!shuffle) {
      setOriginal(queue)
      if (current) {
        setQueue([current, ...shuffled(queue.filter((_, i) => i !== index))])
        setIndex(0)
      }
    } else if (original) {
      const at = current ? original.findIndex((t) => t.id === current.id) : -1
      if (at >= 0) {
        setQueue(original)
        setIndex(at)
      }
      setOriginal(null)
    }
    setShuffle(!shuffle)
  }, [shuffle, queue, current, index, original])

  const cycleRepeat = useCallback(() => setRepeat((r) => ({ off: 'all', all: 'one', one: 'off' })[r]), [])

  /* ── OS media controls, tab title ─────────────────────────────────── */
  useEffect(() => {
    document.title = current ? `${current.title} · ${current.artist} — Mono Music` : 'Mono Music'
    if (!('mediaSession' in navigator) || !current) return
    navigator.mediaSession.metadata = new window.MediaMetadata({
      title: current.title,
      artist: current.artist,
      album: 'Mono Music',
      artwork: [{ src: thumbUrl(current.id), sizes: '480x360', type: 'image/jpeg' }],
    })
  }, [current])

  useEffect(() => {
    if (!('mediaSession' in navigator)) return
    const set = (action, fn) => {
      try {
        navigator.mediaSession.setActionHandler(action, fn)
      } catch {
        // unsupported action
      }
    }
    set('play', toggle)
    set('pause', toggle)
    set('nexttrack', next)
    set('previoustrack', prev)
  }, [toggle, next, prev])

  const value = useMemo(
    () => ({
      mountRef: setMountEl,
      status,
      error,
      queue,
      index,
      current,
      playing,
      buffering,
      shuffle,
      repeat,
      volume,
      muted,
      playTracks,
      playTrack,
      playNext,
      enqueue,
      toggle,
      next,
      prev,
      seek,
      getTime,
      setVolume,
      toggleMute,
      jump,
      removeAt,
      clearUpcoming,
      toggleShuffle,
      cycleRepeat,
    }),
    [status, error, queue, index, current, playing, buffering, shuffle, repeat, volume, muted, playTracks, playTrack,
      playNext, enqueue, toggle, next, prev, seek, getTime, setVolume, toggleMute, jump, removeAt, clearUpcoming, toggleShuffle,
      cycleRepeat],
  )

  const timeValue = useMemo(() => ({ time, duration: duration || current?.duration || 0 }), [time, duration, current])

  return (
    <PlayerContext.Provider value={value}>
      <TimeContext.Provider value={timeValue}>{children}</TimeContext.Provider>
    </PlayerContext.Provider>
  )
}

export const usePlayer = () => useContext(PlayerContext)
export const usePlayerTime = () => useContext(TimeContext)
