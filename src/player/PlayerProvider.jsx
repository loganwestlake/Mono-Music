import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { describePlayerError, loadYouTubeApi, PLAYER_VARS } from '../lib/youtube'
import { artistRadio } from '../lib/deezer'
import { load, save } from '../lib/storage'
import { forgetStream, prefetchStream, resolveStream } from '../lib/streams'
import { isUnresolved, parseVideoTitle, shuffled, thumbUrl } from '../lib/tracks'
import { useLibrary } from '../store/library'
import { useResolver } from '../store/resolver'
import { useToast } from '../store/toast'

/**
 * The single, app-wide player plus queue.
 *
 * Two engines share one mount point (see ScallopedPlayer → `mountRef`):
 *   stream  — a plain <video> fed by Piped/Invidious. No YouTube player,
 *             so no YouTube ads. Used when "Ad-free playback" is on; up to
 *             MAX_STREAM_TRIES different servers are tried per song.
 *   youtube — the official (youtube-nocookie) embedded player, the last
 *             resort. Ads there can't be removed from outside the iframe,
 *             but they're detected, muted and counted down.
 * Both elements are created once and never moved, so playback continues
 * while the listener browses.
 *
 * Two contexts keep the 4×/sec clock from re-rendering the whole app:
 * usePlayer() for queue/controls, usePlayerTime() for time + ad state.
 */

const PlayerContext = createContext(null)
const TimeContext = createContext({ time: 0, duration: 0, ad: null })

const YT_STATE = { ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 }
const STALL_MS = 10000
const MAX_STREAM_TRIES = 3
const LISTEN_TICK = 10

const SAVED_DEFAULTS = { queue: [], index: 0, time: 0, volume: 80, shuffle: false, repeat: 'off', original: null, rate: 1 }

export function PlayerProvider({ children }) {
  const library = useLibrary()
  const { resolve } = useResolver()
  const toast = useToast()
  const { adFree, autoplay, muteAds, notifications } = library.settings
  const [saved] = useState(() => load('player', SAVED_DEFAULTS))

  const [queue, setQueue] = useState(saved.queue)
  const [index, setIndex] = useState(Math.min(saved.index, Math.max(0, saved.queue.length - 1)))
  const [original, setOriginal] = useState(saved.original) // pre-shuffle order
  const [shuffle, setShuffle] = useState(saved.shuffle)
  const [repeat, setRepeat] = useState(saved.repeat)
  const [volume, setVolumeState] = useState(saved.volume)
  const [muted, setMuted] = useState(false)
  const [rate, setRateState] = useState(saved.rate || 1)
  const [sleep, setSleepState] = useState(null) // { at: ms } | { endOfTrack: true }

  const [engine, setEngine] = useState(adFree ? 'stream' : 'youtube')
  const [hasVideo, setHasVideo] = useState(false)
  const [ytStatus, setYtStatus] = useState('idle') // idle | loading | ready | blocked
  const [playing, setPlaying] = useState(false)
  const [buffering, setBuffering] = useState(false)
  const [resolving, setResolving] = useState(false)
  const [error, setError] = useState(null)
  const [time, setTime] = useState(saved.time || 0)
  const [duration, setDuration] = useState(0)
  const [ad, setAd] = useState(null) // { remaining, elapsed } while a YouTube ad plays
  const [mountEl, setMountEl] = useState(null)

  const ytRef = useRef(null)
  const videoRef = useRef(null)
  const ytHostRef = useRef(null)
  const engineRef = useRef(engine)
  const wantPlayRef = useRef(false) // start playing as soon as the current track loads
  const loadedKeyRef = useRef(null) // `${id}|${requested engine}|${attempt}`
  const tokenRef = useRef(0)
  const triedRef = useRef([]) // stream servers that failed for the current track
  const pendingYtRef = useRef(null)
  const pendingSeekRef = useRef(0)
  const resumeAtRef = useRef(saved.time || 0)
  const streamMetaRef = useRef(null)
  const loggedIdRef = useRef(null)
  const errorStreakRef = useRef(0)
  const adMutedRef = useRef(false)
  const radioBusyRef = useRef(false)
  const volumeRef = useRef(volume)
  volumeRef.current = volume
  const rateRef = useRef(rate)
  rateRef.current = rate
  const playingRef = useRef(false)
  playingRef.current = playing

  const current = queue[index] ?? null
  const currentRef = useRef(current)
  currentRef.current = current
  const libRef = useRef(library)
  libRef.current = library

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
    if (!detectAd()) setDuration(eng.duration() || current?.duration || 0)
    const track = current?.pending ? fillMetadata() : current
    if (track && loggedIdRef.current !== track.id) {
      loggedIdRef.current = track.id
      library.addRecent(track)
      library.countPlay(track)
      notify(track)
    }
  }

  handlers.current.paused = () => {
    setPlaying(false)
    setBuffering(false)
    wantPlayRef.current = false
  }

  handlers.current.ended = () => {
    setPlaying(false)
    if (adRef.current) return // an ad finished; the song follows
    if (sleepRef.current?.endOfTrack) {
      setSleepState(null)
      wantPlayRef.current = false
      toast('Sleep timer — goodnight.')
      return
    }
    if (repeat === 'one' || (repeat === 'all' && queue.length === 1)) {
      eng.seek(0)
      eng.play()
    } else if (index < queue.length - 1) {
      wantPlayRef.current = true
      setIndex(index + 1)
    } else if (repeat === 'all') {
      wantPlayRef.current = true
      setIndex(0)
    } else if (autoplay && current) {
      extendWithRadio(current, true)
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
    skipBroken(message)
  }

  handlers.current.streamFailed = () => {
    const track = currentRef.current
    if (engineRef.current !== 'stream' || !track) return
    forgetStream(track.id)
    const at = eng.time() || pendingSeekRef.current
    if (triedRef.current.length < MAX_STREAM_TRIES) loadStream(at)
    else fallbackToYouTube(at)
  }

  function skipBroken(message) {
    errorStreakRef.current += 1
    const canSkip = queue.length > 1 && errorStreakRef.current < queue.length
    toast(canSkip ? `${message} Skipping…` : message)
    if (canSkip) {
      wantPlayRef.current = true
      setTimeout(() => setIndex((i) => (i + 1) % queue.length), 1200)
    }
  }

  /** Pasted links start as placeholders; fill in the real title/artist. */
  function fillMetadata() {
    const raw = eng.isStream() ? streamMetaRef.current : ytRef.current?.getVideoData?.()
    if (!raw?.title) return current
    const filled = { ...current, ...parseVideoTitle(raw.title, raw.author), duration: eng.duration(), pending: false }
    setQueue((q) => q.map((t) => (t.id === filled.id ? filled : t)))
    return filled
  }

  function notify(track) {
    if (!notifications || !document.hidden || !('Notification' in window) || Notification.permission !== 'granted') return
    try {
      new Notification(track.title, { body: track.artist, icon: track.cover || thumbUrl(track.id), silent: true })
    } catch {
      // some browsers only allow notifications from a service worker
    }
  }

  /* ── YouTube ad detection ─────────────────────────────────────────── */
  // The IFrame API doesn't expose ads, but while one plays the player
  // reports the *ad's* duration. If that's clearly shorter than the song we
  // asked for, an ad is on: mute it and show a countdown.
  const adRef = useRef(null)
  adRef.current = ad
  function detectAd() {
    const yt = ytRef.current
    const track = currentRef.current
    if (engineRef.current !== 'youtube' || !yt || !track) return false
    const expected = track.duration || 0
    const d = yt.getDuration?.() || 0
    const t = yt.getCurrentTime?.() || 0
    const isAd = expected > 30 && d > 0 && d < expected - 8 && d <= 180
    if (isAd) {
      setAd({ remaining: Math.max(0, d - t), elapsed: t })
      if (muteAds && !adMutedRef.current && !yt.isMuted?.()) {
        adMutedRef.current = true
        yt.mute?.()
      }
    } else if (adRef.current) {
      setAd(null)
      if (adMutedRef.current) {
        adMutedRef.current = false
        if (!muted) yt.unMute?.()
      }
    }
    return isAd
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
        video.playbackRate = rateRef.current
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
    yt.setPlaybackRate?.(rateRef.current)
  }

  function reportBlocked() {
    setBuffering(false)
    setError('YouTube couldn’t load. It may be blocked on this network, by your school/work device, or by an ad-blocker.')
  }

  function fallbackToYouTube(start) {
    toast('No ad-free copy found for this song — using YouTube (ads are muted).')
    loadYouTube(start)
  }

  function loadStream(start) {
    const track = currentRef.current
    const token = ++tokenRef.current
    switchEngine('stream')
    eng.stopInactive()
    setBuffering(wantPlayRef.current)
    resolveStream(track.id, { exclude: triedRef.current })
      .then((src) => {
        if (token !== tokenRef.current) return
        const v = videoRef.current
        if (!v) return
        triedRef.current.push(src.base)
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
  }

  useEffect(() => {
    if (!mountEl || !current) return

    // Songs from imports/recommendations need a YouTube match first.
    if (isUnresolved(current)) {
      const qid = current.id
      setResolving(true)
      setBuffering(true)
      resolve(current).then((id) => {
        setResolving(false)
        if (currentRef.current?.id !== qid) return
        if (id) setQueue((q) => q.map((t) => (t.id === qid ? { ...t, id } : t)))
        else {
          setBuffering(false)
          setError('Couldn’t find this song on YouTube.')
          skipBroken('Couldn’t find this song on YouTube.')
        }
      })
      return
    }

    const mode = adFree ? 'stream' : 'youtube'
    const key = `${current.id}|${mode}`
    if (loadedKeyRef.current === key) return

    const sameTrack = loadedKeyRef.current?.startsWith(`${current.id}|`)
    const start = sameTrack ? eng.time() : resumeAtRef.current
    resumeAtRef.current = 0
    loadedKeyRef.current = key
    triedRef.current = []
    tokenRef.current++

    setError(null)
    setAd(null)
    setTime(start)
    setDuration(current.duration || 0)
    setPlaying(false)

    if (mode === 'youtube') return loadYouTube(start)
    loadStream(start)
  }, [mountEl, current, adFree]) // eslint-disable-line react-hooks/exhaustive-deps

  // A YouTube load that was waiting for the API.
  useEffect(() => {
    if (engineRef.current !== 'youtube' || !currentRef.current) return
    if (ytStatus === 'ready' && pendingYtRef.current != null) loadYouTube(pendingYtRef.current)
    if (ytStatus === 'blocked') reportBlocked()
  }, [ytStatus]) // eslint-disable-line react-hooks/exhaustive-deps

  // Get the next song ready while this one plays (match + ad-free source).
  const upcoming = queue[index + 1]
  useEffect(() => {
    if (!playing || !upcoming) return
    const id = setTimeout(async () => {
      const vid = isUnresolved(upcoming) ? await resolve(upcoming) : upcoming.id
      if (vid && vid !== upcoming.id) setQueue((q) => q.map((t) => (t.id === upcoming.id ? { ...t, id: vid } : t)))
      if (vid && adFree) prefetchStream(vid)
    }, 4000)
    return () => clearTimeout(id)
  }, [playing, upcoming, adFree, resolve])

  /* ── Clock, ads, sleep timer, listening time ──────────────────────── */
  const sleepRef = useRef(sleep)
  sleepRef.current = sleep
  const listenRef = useRef(0)
  useEffect(() => {
    if (!playing) return
    const id = setInterval(() => {
      if (detectAd()) return
      setTime(eng.time())
      if (sleepRef.current?.at && Date.now() >= sleepRef.current.at) {
        eng.pause()
        setSleepState(null)
        toast('Sleep timer — goodnight.')
      }
      listenRef.current += 0.25 * rateRef.current
      if (listenRef.current >= LISTEN_TICK && currentRef.current) {
        libRef.current.addListen(currentRef.current, Math.round(listenRef.current))
        listenRef.current = 0
      }
    }, 250)
    return () => clearInterval(id)
  }, [playing, eng]) // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Persistence ─────────────────────────────────────────────────── */
  const timeRef = useRef(time)
  timeRef.current = time
  useEffect(() => {
    const persist = () =>
      save('player', { queue: queue.slice(0, 500), index, time: timeRef.current, volume, shuffle, repeat, original, rate })
    persist()
    const id = setInterval(persist, 5000)
    window.addEventListener('pagehide', persist)
    return () => {
      clearInterval(id)
      window.removeEventListener('pagehide', persist)
    }
  }, [queue, index, volume, shuffle, repeat, original, rate])

  /* ── Radio ────────────────────────────────────────────────────────── */
  async function extendWithRadio(seed, continuePlaying) {
    if (radioBusyRef.current) return
    radioBusyRef.current = true
    try {
      const more = await artistRadio(seed.artist, { size: 20, exclude: queue })
      if (!more.length) return
      setQueue((q) => [...q, ...more])
      if (continuePlaying) {
        wantPlayRef.current = true
        setIndex((i) => i + 1)
        toast(`Autoplay: more like ${seed.artist}`)
      }
    } catch {
      wantPlayRef.current = false
    } finally {
      radioBusyRef.current = false
    }
  }

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

  const startRadio = useCallback(
    async (seed) => {
      toast(`Starting ${seed.artist} radio…`)
      try {
        const list = await artistRadio(seed.artist, { size: 30, exclude: [seed] })
        const tracks = seed.id ? [seed, ...list] : list
        if (!tracks.length) return toast('Couldn’t build a radio for this artist.')
        wantPlayRef.current = true
        setOriginal(null)
        setQueue(tracks)
        setIndex(0)
      } catch {
        toast('Couldn’t build a radio right now.')
      }
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
    else if (autoplay && current && repeat !== 'all') extendWithRadio(current, true)
    else if (repeat === 'all' || queue.length > 1) setIndex(0)
    else restartCurrent()
  }, [queue, index, repeat, restartCurrent, autoplay, current]) // eslint-disable-line react-hooks/exhaustive-deps

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
    if (v > 0 && !adMutedRef.current) ytRef.current?.unMute?.()
  }, [])

  const toggleMute = useCallback(() => {
    const nextMuted = !muted
    if (videoRef.current) videoRef.current.muted = nextMuted
    if (nextMuted) ytRef.current?.mute?.()
    else if (!adMutedRef.current) ytRef.current?.unMute?.()
    setMuted(nextMuted)
    if (!nextMuted && volume === 0) setVolume(50)
  }, [muted, volume, setVolume])

  const setRate = useCallback((r) => {
    setRateState(r)
    if (videoRef.current) videoRef.current.playbackRate = r
    ytRef.current?.setPlaybackRate?.(r)
  }, [])

  const setSleep = useCallback(
    (option) => {
      if (option == null) {
        setSleepState(null)
        return toast('Sleep timer off')
      }
      if (option === 'track') {
        setSleepState({ endOfTrack: true })
        return toast('Stopping after this song')
      }
      setSleepState({ at: Date.now() + option * 60000 })
      toast(`Sleep timer: ${option} minutes`)
    },
    [toast],
  )

  /** Try to get past a YouTube ad by switching this song to an ad-free source. */
  const skipAd = useCallback(() => {
    const track = currentRef.current
    if (!track) return
    const at = 0
    toast('Looking for an ad-free copy…')
    triedRef.current = []
    tokenRef.current++
    const token = tokenRef.current
    resolveStream(track.id, { exclude: [] })
      .then(() => {
        if (token !== tokenRef.current) return
        setAd(null)
        adMutedRef.current = false
        ytRef.current?.unMute?.()
        loadedKeyRef.current = `${track.id}|stream`
        loadStream(at)
      })
      .catch(() => token === tokenRef.current && toast('No ad-free copy available — the ad will end shortly.'))
  }, [toast]) // eslint-disable-line react-hooks/exhaustive-deps

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

  /** Replace everything after the current song (drag-to-reorder). */
  const setUpcoming = useCallback((list) => setQueue((q) => [...q.slice(0, index + 1), ...list]), [index])

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
      artwork: [{ src: current.cover || thumbUrl(current.id), sizes: '480x360', type: 'image/jpeg' }],
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
      resolving,
      queue,
      index,
      current,
      playing,
      buffering,
      shuffle,
      repeat,
      volume,
      muted,
      rate,
      sleep,
      playTracks,
      playTrack,
      playNext,
      enqueue,
      startRadio,
      toggle,
      next,
      prev,
      seek,
      getTime,
      setVolume,
      toggleMute,
      setRate,
      setSleep,
      skipAd,
      jump,
      removeAt,
      setUpcoming,
      clearUpcoming,
      toggleShuffle,
      cycleRepeat,
      videoPictureInPicture,
    }),
    [engine, hasVideo, status, error, resolving, queue, index, current, playing, buffering, shuffle, repeat, volume,
      muted, rate, sleep, playTracks, playTrack, playNext, enqueue, startRadio, toggle, next, prev, seek, getTime,
      setVolume, toggleMute, setRate, setSleep, skipAd, jump, removeAt, setUpcoming, clearUpcoming, toggleShuffle,
      cycleRepeat, videoPictureInPicture],
  )

  const timeValue = useMemo(
    () => ({ time, duration: duration || current?.duration || 0, ad }),
    [time, duration, current, ad],
  )

  return (
    <PlayerContext.Provider value={value}>
      <TimeContext.Provider value={timeValue}>{children}</TimeContext.Provider>
    </PlayerContext.Provider>
  )
}

export const usePlayer = () => useContext(PlayerContext)
export const usePlayerTime = () => useContext(TimeContext)
