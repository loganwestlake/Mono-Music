import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { describePlayerError, loadYouTubeApi, PLAYER_VARS } from '../lib/youtube'
import { load, save } from '../lib/storage'
import { forgetStream, resolveStream } from '../lib/streams'
import { parseVideoTitle, shuffled, thumbUrl } from '../lib/tracks'
import { useLibrary } from '../store/library'
import { useToast } from '../store/toast'

/**
 * The single, app-wide player plus queue.
 *
 * Two engines share one mount point (see ScallopedPlayer → `mountRef`):
 *   stream  — a plain <video> fed by Piped/Invidious. No YouTube player,
 *             so no YouTube ads. Used when "Ad-free playback" is on.
 *   youtube — the official (youtube-nocookie) embedded player. Used when
 *             ad-free is off, or as a fallback when no stream is available.
 * Both elements are created once and never moved, so playback continues
 * while the listener browses.
 *
 * State is split into two contexts so the 4×/sec clock doesn't re-render
 * the whole app: usePlayer() for queue/controls, usePlayerTime() for time.
 */

const PlayerContext = createContext(null)
const TimeContext = createContext({ time: 0, duration: 0 })

const YT_STATE = { ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 }
const STALL_MS = 12000

const SAVED_DEFAULTS = { queue: [], index: 0, time: 0, volume: 80, shuffle: false, repeat: 'off', original: null }

export function PlayerProvider({ children }) {
  const library = useLibrary()
  const toast = useToast()
  const adFree = library.settings.adFree !== false
  const [saved] = useState(() => load('player', SAVED_DEFAULTS))

  const [queue, setQueue] = useState(saved.queue)
  const [index, setIndex] = useState(Math.min(saved.index, Math.max(0, saved.queue.length - 1)))
  const [original, setOriginal] = useState(saved.original) // pre-shuffle order
  const [shuffle, setShuffle] = useState(saved.shuffle)
  const [repeat, setRepeat] = useState(saved.repeat)
  const [volume, setVolumeState] = useState(saved.volume)
  const [muted, setMuted] = useState(false)

  const [engine, setEngine] = useState(adFree ? 'stream' : 'youtube')
  const [hasVideo, setHasVideo] = useState(false)
  const [ytStatus, setYtStatus] = useState('idle') // idle | loading | ready | blocked
  const [playing, setPlaying] = useState(false)
  const [buffering, setBuffering] = useState(false)
  const [error, setError] = useState(null)
  const [time, setTime] = useState(saved.time || 0)
  const [duration, setDuration] = useState(0)
  const [mountEl, setMountEl] = useState(null)

  const ytRef = useRef(null)
  const videoRef = useRef(null)
  const ytHostRef = useRef(null)
  const engineRef = useRef(engine)
  const wantPlayRef = useRef(false) // start playing as soon as the current track loads
  const loadedKeyRef = useRef(null) // `${id}|${requested engine}`
  const tokenRef = useRef(0)
  const pendingYtRef = useRef(null) // start time for a YouTube load waiting on the API
  const pendingSeekRef = useRef(0)
  const resumeAtRef = useRef(saved.time || 0)
  const streamMetaRef = useRef(null)
  const loggedIdRef = useRef(null)
  const errorStreakRef = useRef(0)
  const fallbackToastRef = useRef(false)
  const volumeRef = useRef(volume)
  volumeRef.current = volume
  const playingRef = useRef(false)
  playingRef.current = playing

  const current = queue[index] ?? null
  const currentRef = useRef(current)
  currentRef.current = current

  const switchEngine = (kind) => {
    engineRef.current = kind
    setEngine(kind)
  }

  /* ── Engine-agnostic controls (read refs, so always fresh) ────────── */
  const eng = useMemo(
    () => ({
      isStream: () => engineRef.current === 'stream',
      play() {
        if (this.isStream()) videoRef.current?.play().catch(() => setPlaying(false))
        else ytRef.current?.playVideo?.()
      },
      pause() {
        if (this.isStream()) videoRef.current?.pause()
        else ytRef.current?.pauseVideo?.()
      },
      seek(s) {
        if (this.isStream()) {
          if (videoRef.current) videoRef.current.currentTime = s
        } else ytRef.current?.seekTo?.(s, true)
      },
      time() {
        return (this.isStream() ? videoRef.current?.currentTime : ytRef.current?.getCurrentTime?.()) || 0
      },
      duration() {
        const d = this.isStream() ? videoRef.current?.duration : ytRef.current?.getDuration?.()
        return Number.isFinite(d) ? d : 0
      },
      stopInactive() {
        if (this.isStream()) ytRef.current?.stopVideo?.()
        else {
          const v = videoRef.current
          if (v) {
            v.pause()
            v.removeAttribute('src')
            v.load()
          }
        }
      },
    }),
    [],
  )

  /* ── Common reactions to engine events ────────────────────────────── */
  const handlers = useRef({})

  handlers.current.playing = () => {
    setPlaying(true)
    setBuffering(false)
    setError(null)
    wantPlayRef.current = true
    errorStreakRef.current = 0
    setDuration(eng.duration() || current?.duration || 0)
    const track = current?.pending ? fillMetadata() : current
    if (track && loggedIdRef.current !== track.id) {
      loggedIdRef.current = track.id
      library.addRecent(track)
    }
  }

  handlers.current.paused = () => {
    setPlaying(false)
    setBuffering(false)
    wantPlayRef.current = false
  }

  handlers.current.ended = () => {
    setPlaying(false)
    if (repeat === 'one' || (repeat === 'all' && queue.length === 1)) {
      eng.seek(0)
      eng.play()
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

  handlers.current.ytState = (state) => {
    if (engineRef.current !== 'youtube') return
    if (state === YT_STATE.PLAYING) handlers.current.playing()
    else if (state === YT_STATE.PAUSED) handlers.current.paused()
    else if (state === YT_STATE.BUFFERING) setBuffering(true)
    else if (state === YT_STATE.ENDED) handlers.current.ended()
    else if (state === YT_STATE.CUED) {
      setPlaying(false)
      setBuffering(false)
    }
  }

  handlers.current.ytError = (code) => {
    if (engineRef.current !== 'youtube') return
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

  handlers.current.streamFailed = () => {
    if (engineRef.current !== 'stream' || !currentRef.current) return
    forgetStream(currentRef.current.id)
    fallbackToYouTube(eng.time() || pendingSeekRef.current)
  }

  /** Pasted links start as placeholders; fill in the real title/artist. */
  function fillMetadata() {
    const raw = eng.isStream() ? streamMetaRef.current : ytRef.current?.getVideoData?.()
    if (!raw?.title) return current
    const filled = { ...current, ...parseVideoTitle(raw.title, raw.author), duration: eng.duration(), pending: false }
    setQueue((q) => q.map((t) => (t.id === filled.id ? filled : t)))
    return filled
  }

  /* ── Create both engines once a mount point exists ────────────────── */
  useEffect(() => {
    if (!mountEl) return
    let cancelled = false

    const ytHost = document.createElement('div')
    ytHost.className = 'absolute inset-0 [&_iframe]:h-full [&_iframe]:w-full'
    const ytTarget = document.createElement('div')
    ytHost.appendChild(ytTarget)

    const video = document.createElement('video')
    video.className = 'absolute inset-0 h-full w-full bg-[#111]'
    video.playsInline = true
    video.preload = 'auto'
    video.volume = volumeRef.current / 100

    mountEl.replaceChildren(ytHost, video)
    ytHostRef.current = ytHost
    videoRef.current = video

    const on = (name, fn) => video.addEventListener(name, fn)
    const ifStream = (fn) => () => engineRef.current === 'stream' && fn()
    on('playing', ifStream(() => handlers.current.playing()))
    on('pause', ifStream(() => !video.ended && handlers.current.paused()))
    on('waiting', ifStream(() => setBuffering(true)))
    on('ended', ifStream(() => handlers.current.ended()))
    on(
      'loadedmetadata',
      ifStream(() => {
        setDuration(video.duration || 0)
        setHasVideo(video.videoWidth > 0)
        if (pendingSeekRef.current) video.currentTime = pendingSeekRef.current
        pendingSeekRef.current = 0
      }),
    )
    on('error', ifStream(() => video.getAttribute('src') && handlers.current.streamFailed()))

    setYtStatus('loading')
    loadYouTubeApi()
      .then((YT) => {
        if (cancelled) return
        ytRef.current = new YT.Player(ytTarget, {
          width: '100%',
          height: '100%',
          host: 'https://www.youtube-nocookie.com',
          playerVars: { ...PLAYER_VARS, origin: window.location.origin },
          events: {
            onReady: (e) => {
              e.target.setVolume(volumeRef.current)
              setYtStatus('ready')
            },
            onStateChange: (e) => handlers.current.ytState(e.data),
            onError: (e) => handlers.current.ytError(e.data),
          },
        })
      })
      .catch(() => !cancelled && setYtStatus('blocked'))

    return () => {
      cancelled = true
      video.pause()
      video.removeAttribute('src')
      video.load()
      ytRef.current?.destroy?.()
      ytRef.current = null
      videoRef.current = null
      loadedKeyRef.current = null
      setYtStatus('idle')
    }
  }, [mountEl])

  // Only the active engine is visible.
  useEffect(() => {
    if (ytHostRef.current) ytHostRef.current.style.visibility = engine === 'youtube' ? 'visible' : 'hidden'
    if (videoRef.current) videoRef.current.style.visibility = engine === 'stream' ? 'visible' : 'hidden'
  }, [engine, mountEl])

  /* ── Load whichever track is current ──────────────────────────────── */
  function loadYouTube(start) {
    switchEngine('youtube')
    eng.stopInactive()
    setHasVideo(true)
    const yt = ytRef.current
    if (!yt || ytStatus !== 'ready') {
      pendingYtRef.current = start
      if (ytStatus === 'blocked') reportBlocked()
      return
    }
    pendingYtRef.current = null
    const id = currentRef.current.id
    if (wantPlayRef.current) yt.loadVideoById({ videoId: id, startSeconds: start })
    else yt.cueVideoById({ videoId: id, startSeconds: start })
  }

  function reportBlocked() {
    setBuffering(false)
    setError('YouTube couldn’t load. It may be blocked on this network, by your school/work device, or by an ad-blocker.')
  }

  function fallbackToYouTube(start) {
    if (!fallbackToastRef.current) {
      fallbackToastRef.current = true
      toast('Ad-free source unavailable for this song — using YouTube.')
    }
    loadYouTube(start)
  }

  useEffect(() => {
    if (!mountEl || !current) return
    const mode = adFree ? 'stream' : 'youtube'
    const key = `${current.id}|${mode}`
    if (loadedKeyRef.current === key) return

    const sameTrack = loadedKeyRef.current?.startsWith(`${current.id}|`)
    const start = sameTrack ? eng.time() : resumeAtRef.current
    resumeAtRef.current = 0
    loadedKeyRef.current = key
    const token = ++tokenRef.current

    setError(null)
    setTime(start)
    setDuration(current.duration || 0)
    setBuffering(wantPlayRef.current)
    setPlaying(false)

    if (mode === 'youtube') return loadYouTube(start)

    switchEngine('stream')
    eng.stopInactive()
    resolveStream(current.id)
      .then((src) => {
        if (token !== tokenRef.current) return
        const v = videoRef.current
        if (!v) return
        streamMetaRef.current = src.meta
        setHasVideo(src.hasVideo)
        pendingSeekRef.current = start
        v.src = src.url
        if (wantPlayRef.current) {
          v.play().catch(() => setPlaying(false))
          // A stream that never starts is as bad as one that errors.
          setTimeout(() => {
            if (token === tokenRef.current && engineRef.current === 'stream' && !playingRef.current && wantPlayRef.current)
              handlers.current.streamFailed()
          }, STALL_MS)
        }
      })
      .catch(() => token === tokenRef.current && fallbackToYouTube(start))
  }, [mountEl, current, adFree]) // eslint-disable-line react-hooks/exhaustive-deps

  // A YouTube load that was waiting for the API.
  useEffect(() => {
    if (engineRef.current !== 'youtube' || !currentRef.current) return
    if (ytStatus === 'ready' && pendingYtRef.current != null) loadYouTube(pendingYtRef.current)
    if (ytStatus === 'blocked') reportBlocked()
  }, [ytStatus]) // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Clock ────────────────────────────────────────────────────────── */
  useEffect(() => {
    if (!playing) return
    const id = setInterval(() => setTime(eng.time()), 250)
    return () => clearInterval(id)
  }, [playing, eng])

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
    eng.seek(0)
    eng.play()
  }, [eng])

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
      if (loadedKeyRef.current?.startsWith(`${first.id}|`)) restartCurrent()
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
    if (!current) return
    if (playing) eng.pause()
    else {
      wantPlayRef.current = true
      eng.play()
    }
  }, [playing, current, eng])

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
    if (eng.time() > 3 || index === 0) restartCurrent()
    else setIndex(index - 1)
  }, [queue.length, index, restartCurrent, eng])

  const seek = useCallback(
    (seconds) => {
      eng.seek(seconds)
      setTime(seconds)
    },
    [eng],
  )

  const getTime = useCallback(() => eng.time() || timeRef.current, [eng])

  const setVolume = useCallback((v) => {
    setVolumeState(v)
    setMuted(v === 0)
    if (videoRef.current) {
      videoRef.current.volume = v / 100
      videoRef.current.muted = v === 0
    }
    ytRef.current?.setVolume?.(v)
    if (v > 0) ytRef.current?.unMute?.()
  }, [])

  const toggleMute = useCallback(() => {
    const nextMuted = !muted
    if (videoRef.current) videoRef.current.muted = nextMuted
    if (nextMuted) ytRef.current?.mute?.()
    else ytRef.current?.unMute?.()
    setMuted(nextMuted)
    if (!nextMuted && volume === 0) setVolume(50)
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

  /** Native picture-in-picture for the ad-free <video> (browsers without Document PiP). */
  const videoPictureInPicture = useCallback(async () => {
    const v = videoRef.current
    if (!v || engineRef.current !== 'stream' || !document.pictureInPictureEnabled || !v.videoWidth) return false
    await v.requestPictureInPicture()
    return true
  }, [])

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
    set('seekto', (d) => d.seekTime != null && seek(d.seekTime))
  }, [toggle, next, prev, seek])

  const status = engine === 'stream' ? 'ready' : ytStatus

  const value = useMemo(
    () => ({
      mountRef: setMountEl,
      engine,
      hasVideo,
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
      videoPictureInPicture,
    }),
    [engine, hasVideo, status, error, queue, index, current, playing, buffering, shuffle, repeat, volume, muted,
      playTracks, playTrack, playNext, enqueue, toggle, next, prev, seek, getTime, setVolume, toggleMute, jump,
      removeAt, clearUpcoming, toggleShuffle, cycleRepeat, videoPictureInPicture],
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
